package com.shadowburn.app;

import android.app.Activity;
import android.content.Intent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * "Backup exportieren" in der Android-App: der WebView ignoriert Browser-Downloads (Blob-Links),
 * deshalb speichert dieses Plugin die Datei selbst. Braucht keine Berechtigung.
 *  Android 10+: direkt in den Ordner Download (MediaStore).  Android 6-9: Dialog "Speichern unter".
 *  saveText({ name, mime, text }) -> { status: 'saved' | 'cancelled', name, folder }
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {
    @PluginMethod
    public void saveText(PluginCall call) {
        String name = call.getString("name", "backup.json");
        String mime = call.getString("mime", "application/json");
        if (call.getString("text") == null) { call.reject("text fehlt"); return; }
        if (Build.VERSION.SDK_INT >= 29) { saveToDownloads(call, name, mime); return; }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, i, "saveResult");
    }

    private void saveToDownloads(PluginCall call, String name, String mime) {
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new java.io.IOException("Download-Ordner nicht erreichbar");
            try (OutputStream out = cr.openOutputStream(uri, "wt")) {
                if (out == null) throw new java.io.IOException("kein Ausgabestrom");
                out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            // tatsächlichen Namen lesen (Android hängt bei Doppelten " (1)" an)
            String saved = name;
            try (android.database.Cursor c = cr.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) saved = c.getString(0);
            }
            JSObject r = new JSObject();
            r.put("status", "saved");
            r.put("name", saved);
            r.put("folder", "Download");
            call.resolve(r);
        } catch (Exception e) {
            if (uri != null) try { cr.delete(uri, null, null); } catch (Exception ignored) {}
            call.reject("Speichern fehlgeschlagen: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            r.put("status", "cancelled");
            call.resolve(r);
            return;
        }
        Uri uri = data.getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new java.io.IOException("kein Ausgabestrom");
            out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            call.reject("Speichern fehlgeschlagen: " + e.getMessage());
            return;
        }
        r.put("status", "saved");
        r.put("name", uri.getLastPathSegment());
        call.resolve(r);
    }
}
