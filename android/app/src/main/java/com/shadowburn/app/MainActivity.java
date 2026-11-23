package com.shadowburn.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigenes Plugin: Bluetooth-Austausch bei Treffen (muss vor super.onCreate registriert werden)
        registerPlugin(BleExchangePlugin.class);
        // Eigenes Plugin: "App aktualisieren" in den Einstellungen (APK wählen, prüfen, installieren, aufräumen)
        registerPlugin(ApkUpdatePlugin.class);
        // Eigenes Plugin: "Backup exportieren" als echte Datei speichern (WebView ignoriert Blob-Downloads)
        registerPlugin(FileSavePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
