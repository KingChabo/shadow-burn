package com.shadowburn.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * "App aktualisieren" in den Einstellungen: neue Shadow-Burn-APK aus den Dateien wählen und installieren.
 *  pick()             Dateiauswahl, Kopie nach cacheDir/update/update.apk, Prüfung (gleiche App, neuere Version)
 *  canInstall()       darf die App andere Apps installieren? Sonst openInstallSettings()
 *  install()          Android-Installationsdialog öffnen, vorher merken, was nach dem Update aufzuräumen ist
 *  cleanupIfUpdated() beim Start: läuft die neue Version, Cache-Kopie und gewählte APK-Datei löschen
 */
@CapacitorPlugin(name = "ApkUpdate")
public class ApkUpdatePlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String PREFS = "apk_update";
    private static final String K_PICK_URI = "pickUri";
    private static final String K_PICK_VC = "pickVersionCode";
    private static final String K_PENDING_URI = "pendingUpdateUri";
    private static final String K_PENDING_VC = "pendingUpdateVersionCode";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private File cacheApk() {
        return new File(new File(getContext().getCacheDir(), "update"), "update.apk");
    }

    @SuppressWarnings("deprecation")
    private static long code(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(APK_MIME).addFlags(flags);
        try {
            startActivityForResult(call, i, "pickResult");
        } catch (ActivityNotFoundException e) {
            Intent any = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").addFlags(flags);
            startActivityForResult(call, any, "pickResult");
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            r.put("status", "cancelled");
            call.resolve(r);
            return;
        }
        Uri uri = data.getData();
        File apk = cacheApk();
        try {
            PackageInfo own = installed();
            r.put("installedVersionName", own.versionName);
            r.put("installedVersionCode", code(own));

            apk.getParentFile().mkdirs();
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(apk)) {
                if (in == null) throw new Exception("Datei lässt sich nicht öffnen");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }

            PackageInfo p = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            if (p == null || !getContext().getPackageName().equals(p.packageName)) {
                apk.delete();
                r.put("status", "wrong-app");
                call.resolve(r);
                return;
            }
            r.put("versionName", p.versionName);
            r.put("versionCode", code(p));
            if (code(p) <= code(own)) {
                apk.delete();
                r.put("status", "not-newer");
                call.resolve(r);
                return;
            }
            // Zugriff auf die gewählte Datei behalten, damit sie nach dem Update gelöscht werden kann
            int keep = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try { getContext().getContentResolver().takePersistableUriPermission(uri, keep); } catch (Exception ignored) {}
            prefs().edit().putString(K_PICK_URI, uri.toString()).putLong(K_PICK_VC, code(p)).commit();
            r.put("status", "ok");
            call.resolve(r);
        } catch (Exception e) {
            apk.delete();
            call.reject("Datei konnte nicht gelesen werden: " + e.getMessage());
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Einstellungen lassen sich nicht öffnen: " + e.getMessage());
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = cacheApk();
        String pickUri = prefs().getString(K_PICK_URI, null);
        if (!apk.exists() || pickUri == null) {
            call.reject("Keine Update-Datei gewählt. Bitte nochmal auswählen.");
            return;
        }
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(s);
            } catch (Exception ignored) {}
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        prefs().edit()
            .putString(K_PENDING_URI, pickUri)
            .putLong(K_PENDING_VC, prefs().getLong(K_PICK_VC, 0))
            .commit();
        try {
            Uri content = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(content, APK_MIME);
            // CLEAR_TASK: hängt noch ein altes Installer-Fenster herum (z. B. "App installiert – Öffnen"),
            // würde Android den neuen Auftrag sonst dorthin schicken und gar keinen Dialog zeigen
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            getContext().startActivity(i);
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            prefs().edit().remove(K_PENDING_URI).remove(K_PENDING_VC).commit();
            call.reject("Installation lässt sich nicht starten: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cleanupIfUpdated(PluginCall call) {
        JSObject r = new JSObject();
        r.put("done", false);
        try {
            SharedPreferences p = prefs();
            long want = p.getLong(K_PENDING_VC, 0);
            String uri = p.getString(K_PENDING_URI, null);
            PackageInfo own = installed();
            if (want <= 0 || uri == null || code(own) < want) {
                call.resolve(r);
                return;
            }
            cacheApk().delete();
            boolean fileDeleted = false;
            Uri u = Uri.parse(uri);
            try { fileDeleted = DocumentsContract.deleteDocument(getContext().getContentResolver(), u); } catch (Exception ignored) {}
            try {
                getContext().getContentResolver().releasePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception ignored) {}
            p.edit().remove(K_PENDING_URI).remove(K_PENDING_VC).remove(K_PICK_URI).remove(K_PICK_VC).commit();
            r.put("done", true);
            r.put("fileDeleted", fileDeleted);
            r.put("versionName", own.versionName);
        } catch (Exception ignored) {}
        call.resolve(r);
    }
}
