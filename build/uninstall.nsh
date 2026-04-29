; Removes the native messaging host registry keys written by the app's
; "Browser Integration" settings tab.  Called during NSIS uninstall.

!macro customUnInstall
    ; Chrome
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.proxyscrape.checker"
    ; Edge
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.proxyscrape.checker"
    ; Brave
    DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.proxyscrape.checker"
    ; Opera
    DeleteRegKey HKCU "Software\Opera Software\NativeMessagingHosts\com.proxyscrape.checker"
    ; Vivaldi
    DeleteRegKey HKCU "Software\Vivaldi\NativeMessagingHosts\com.proxyscrape.checker"
    ; Chromium
    DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\com.proxyscrape.checker"
    ; Firefox (covers all variants — Dev Edition, Nightly share the same key)
    DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\com.proxyscrape.checker"
!macroend
