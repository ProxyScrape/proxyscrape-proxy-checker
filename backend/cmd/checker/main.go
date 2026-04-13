// Command checker is the ProxyScrape Proxy Checker backend CLI (desktop sidecar + server).
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/proxyscrape/checker-backend/internal/api"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

var (
	serveMode    string
	servePort    int
	serveDataDir string
	serveBind    []string
)

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "checker",
	Short: "ProxyScrape Proxy Checker backend",
}

func init() {
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(userCmd)
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the HTTP API server",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().StringVar(&serveMode, "mode", "desktop", "Run mode: desktop or server")
	serveCmd.Flags().IntVar(&servePort, "port", 0, "TCP port (0 = random)")
	serveCmd.Flags().StringVar(&serveDataDir, "data-dir", defaultDataDir(), "Directory for SQLite and settings (Electron userData in production)")
	serveCmd.Flags().StringSliceVar(&serveBind, "bind", []string{"127.0.0.1"}, "Addresses to listen on (repeatable); desktop mode always uses 127.0.0.1")
}

func defaultDataDir() string {
	cfg, err := os.UserConfigDir()
	if err != nil {
		return "."
	}
	return filepath.Join(cfg, "proxyscrape-proxy-checker")
}

func runServe(cmd *cobra.Command, _ []string) error {
	mode := strings.ToLower(strings.TrimSpace(serveMode))
	if mode != "desktop" && mode != "server" {
		return fmt.Errorf("--mode must be desktop or server, got %q", serveMode)
	}

	db, err := store.Open(serveDataDir)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer db.Close()

	if err := db.PurgeExpiredSessions(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "warning: purge sessions: %v\n", err)
	}

	mgr, err := settings.Load(serveDataDir)
	if err != nil {
		return fmt.Errorf("load settings: %w", err)
	}

	if mode == "server" {
		hasUsers, err := db.HasUsers(context.Background())
		if err != nil {
			return fmt.Errorf("check users: %w", err)
		}
		if !hasUsers {
			fmt.Fprintln(os.Stderr, "No users found. Create one first:  checker user create")
			os.Exit(1)
		}
	}

	if mode == "desktop" {
		return serveDesktop(db, mgr)
	}
	return serveServer(db, mgr)
}

func serveDesktop(db *store.Store, mgr *settings.Manager) error {
	u, err := uuid.NewRandomFromReader(rand.Reader)
	if err != nil {
		return err
	}
	tokenStr := u.String()
	verify := func(ctx context.Context, token string) bool {
		if len(token) != len(tokenStr) {
			return false
		}
		return subtle.ConstantTimeCompare([]byte(token), []byte(tokenStr)) == 1
	}
	handler := api.NewServer(verify, db, mgr)

	addr := "127.0.0.1:0"
	if servePort > 0 {
		addr = fmt.Sprintf("127.0.0.1:%d", servePort)
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	port := ln.Addr().(*net.TCPAddr).Port

	fmt.Printf("CHECKER_PORT=%d\n", port)
	fmt.Printf("CHECKER_TOKEN=%s\n", tokenStr)

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Serve(ln)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		return nil
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

func serveServer(db *store.Store, mgr *settings.Manager) error {
	verify := func(ctx context.Context, token string) bool {
		return db.ValidateSession(ctx, token)
	}
	handler := api.NewServer(verify, db, mgr)

	binds := serveBind
	if len(binds) == 0 {
		binds = []string{"127.0.0.1"}
	}

	port := servePort
	if port == 0 {
		ln0, err := net.Listen("tcp", fmt.Sprintf("%s:0", binds[0]))
		if err != nil {
			return err
		}
		port = ln0.Addr().(*net.TCPAddr).Port
		_ = ln0.Close()
	}

	var listeners []net.Listener
	for _, host := range binds {
		ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))
		if err != nil {
			for _, l := range listeners {
				_ = l.Close()
			}
			return err
		}
		listeners = append(listeners, ln)
	}

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
	}

	errCh := make(chan error, len(listeners))
	for _, ln := range listeners {
		ln := ln
		go func() {
			errCh <- srv.Serve(ln)
		}()
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		return nil
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

// --- user ---

var userCmd = &cobra.Command{
	Use:   "user",
	Short: "Manage server users (server mode)",
}

var userCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new user (interactive)",
	RunE:  runUserCreate,
}

var (
	userListUsername   string
	userDeleteUsername string
	userPasswdUsername string
)

var userListCmd = &cobra.Command{
	Use:   "list",
	Short: "List users",
	RunE: func(cmd *cobra.Command, args []string) error {
		db, err := store.Open(serveDataDir)
		if err != nil {
			return fmt.Errorf("open store: %w", err)
		}
		defer db.Close()

		users, err := db.ListUsers(context.Background())
		if err != nil {
			return err
		}
		if len(users) == 0 {
			fmt.Println("No users found.")
			return nil
		}
		for _, u := range users {
			fmt.Printf("%-20s  created %s\n", u.Username, u.CreatedAt.Format("2006-01-02 15:04:05"))
		}
		return nil
	},
}

var userDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete a user",
	RunE: func(cmd *cobra.Command, args []string) error {
		if userDeleteUsername == "" {
			return fmt.Errorf("--username is required")
		}
		db, err := store.Open(serveDataDir)
		if err != nil {
			return fmt.Errorf("open store: %w", err)
		}
		defer db.Close()

		if err := db.DeleteUser(context.Background(), userDeleteUsername); err != nil {
			return err
		}
		fmt.Printf("User %q deleted.\n", userDeleteUsername)
		return nil
	},
}

var userPasswdCmd = &cobra.Command{
	Use:   "passwd",
	Short: "Change a user's password",
	RunE: func(cmd *cobra.Command, args []string) error {
		if userPasswdUsername == "" {
			return fmt.Errorf("--username is required")
		}

		fmt.Fprint(os.Stderr, "New password: ")
		pw, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr)

		if err := validatePassword(string(pw)); err != nil {
			return err
		}

		hash, err := bcrypt.GenerateFromPassword(pw, bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		db, err := store.Open(serveDataDir)
		if err != nil {
			return fmt.Errorf("open store: %w", err)
		}
		defer db.Close()

		if err := db.UpdateUserPassword(context.Background(), userPasswdUsername, string(hash)); err != nil {
			return err
		}
		fmt.Printf("Password for %q updated.\n", userPasswdUsername)
		return nil
	},
}

func init() {
	userCmd.AddCommand(userCreateCmd, userListCmd, userDeleteCmd, userPasswdCmd)

	userDeleteCmd.Flags().StringVar(&userDeleteUsername, "username", "", "Username to delete")
	userPasswdCmd.Flags().StringVar(&userPasswdUsername, "username", "", "Username whose password to change")

	// Reuse the global --data-dir flag for user subcommands.
	userCmd.PersistentFlags().StringVar(&serveDataDir, "data-dir", defaultDataDir(), "Directory for SQLite database")
}

func runUserCreate(cmd *cobra.Command, args []string) error {
	fmt.Fprint(os.Stderr, "Username: ")
	username, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return err
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("username is required")
	}

	fmt.Fprint(os.Stderr, "Password: ")
	pw, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr)

	if err := validatePassword(string(pw)); err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword(pw, bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	db, err := store.Open(serveDataDir)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer db.Close()

	id := uuid.New().String()
	if err := db.CreateUser(context.Background(), id, username, string(hash)); err != nil {
		return err
	}

	fmt.Printf("User %q created.\n", username)
	return nil
}

func validatePassword(pw string) error {
	if len(pw) < 12 {
		return fmt.Errorf("password must be at least 12 characters")
	}
	var upper, lower, digit, special bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			special = true
		}
	}
	if !upper || !lower || !digit || !special {
		return fmt.Errorf("password must include uppercase, lowercase, digit, and special character")
	}
	return nil
}
