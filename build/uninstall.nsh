; Removes the native messaging host registry keys written by the app's
; "Browser Integration" settings tab.  Called during NSIS uninstall.

!macro customUnInstall
    ; Chrome
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.proxyscrape.proxychecker"
    ; Edge
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.proxyscrape.proxychecker"
    ; Brave
    DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.proxyscrape.proxychecker"
    ; Firefox
    DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\com.proxyscrape.proxychecker"
!macroend
