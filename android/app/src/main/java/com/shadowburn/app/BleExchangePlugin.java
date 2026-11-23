package com.shadowburn.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Bluetooth-Austausch bei Treffen (Handy zu Handy, ohne Internet).
 *
 * Jedes Handy ist gleichzeitig sichtbar (Advertising + GATT-Server) und sucht (Scan nach
 * derselben Service-UUID). Wer auf ein Gerät tippt, verbindet sich als Central und schreibt
 * in RX; das andere Handy antwortet per Notify auf TX. Diese Klasse schiebt nur Pakete hin
 * und her (mit Flusskontrolle); Zerlegen, Prüfsumme und Ablauf stehen in src/lib/bleProtocol.ts.
 *
 * Läuft nur, solange der Bildschirm "In der Nähe tauschen" offen ist (JS ruft start/stop).
 * Geht die App in den Hintergrund, wird alles sofort beendet.
 */
@SuppressLint("MissingPermission")
@CapacitorPlugin(
    name = "BleExchange",
    permissions = {
        @Permission(
            alias = "ble",
            strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT }
        ),
        @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class BleExchangePlugin extends Plugin {

    static final UUID SERVICE = UUID.fromString("6e3a0001-5b1d-4f6a-9c2e-5348414457b1");
    /** Central schreibt hierhin */
    static final UUID RX = UUID.fromString("6e3a0002-5b1d-4f6a-9c2e-5348414457b1");
    /** Peripheral meldet hierüber (Notify) */
    static final UUID TX = UUID.fromString("6e3a0003-5b1d-4f6a-9c2e-5348414457b1");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    /** Hersteller-ID 0xFFFF ist für Tests/eigene Zwecke reserviert */
    static final int MANUF = 0xFFFF;

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothManager manager;
    private BluetoothAdapter adapter;

    private BluetoothGattServer server;
    private BluetoothGattCharacteristic txLocal;
    private BluetoothLeAdvertiser advertiser;
    private AdvertiseCallback advCb;
    private byte[] advert;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCb;
    private final Map<String, Long> lastSeen = new HashMap<>();

    // Verbindung als Central (ich habe getippt)
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic rxRemote;
    private PluginCall connectCall;
    private int centralMtu = 23;

    // Verbindung als Peripheral (das andere Handy hat getippt)
    private BluetoothDevice peer;
    private final Map<String, Integer> mtus = new HashMap<>();

    // Sendewarteschlange
    private ArrayDeque<byte[]> queue;
    private String sendRole;
    private PluginCall sendCall;
    private int sendTotal;
    private int sendDone;
    private int retries;
    private final Runnable sendWatchdog = () -> failSend("Senden hängt");
    private final Runnable connectWatchdog = () -> {
        if (connectCall != null) {
            PluginCall c = connectCall;
            connectCall = null;
            closeGatt();
            c.reject("Keine Verbindung zum anderen Handy");
        }
    };

    @Override
    public void load() {
        manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;
    }

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "ble" : "loc";
    }

    private boolean granted() {
        return getPermissionState(alias()) == PermissionState.GRANTED;
    }

    private boolean supported() {
        return adapter != null && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE);
    }

    private static String b64(byte[] b) {
        return Base64.encodeToString(b, Base64.NO_WRAP);
    }

    // ---------- Status, Berechtigung, Einschalten ----------

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        boolean sup = supported();
        r.put("supported", sup);
        r.put("granted", granted());
        boolean on = false;
        boolean adv = false;
        try {
            on = sup && adapter.isEnabled();
            adv = on && adapter.isMultipleAdvertisementSupported();
        } catch (SecurityException ignored) {}
        r.put("enabled", on);
        r.put("advertise", adv);
        call.resolve(r);
    }

    @PluginMethod
    public void askPermission(PluginCall call) {
        if (granted()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias(alias(), call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (!supported()) {
            call.reject("Kein Bluetooth");
            return;
        }
        if (!granted()) {
            call.reject("Keine Berechtigung");
            return;
        }
        if (adapter.isEnabled()) {
            JSObject r = new JSObject();
            r.put("enabled", true);
            call.resolve(r);
            return;
        }
        startActivityForResult(call, new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableResult");
    }

    @ActivityCallback
    private void enableResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(r);
    }

    // ---------- Sichtbar sein + suchen ----------

    @PluginMethod
    public void start(PluginCall call) {
        String a = call.getString("advert", "");
        main.post(() -> {
            if (!supported() || !granted() || !adapter.isEnabled()) {
                call.reject("Bluetooth ist nicht bereit");
                return;
            }
            stopAll();
            advert = Base64.decode(a, Base64.DEFAULT);
            if (advert.length > 27) {
                byte[] cut = new byte[27];
                System.arraycopy(advert, 0, cut, 0, 27);
                advert = cut;
            }
            boolean srv = openServer();
            startScan();
            JSObject r = new JSObject();
            r.put("server", srv);
            r.put("advertise", adapter.isMultipleAdvertisementSupported());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void scan(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        main.post(() -> {
            if (on) startScan();
            else stopScan();
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            stopAll();
            call.resolve();
        });
    }

    private boolean openServer() {
        try {
            server = manager.openGattServer(getContext(), serverCb);
        } catch (Exception e) {
            server = null;
        }
        if (server == null) {
            emitState("server", 0);
            return false;
        }
        BluetoothGattService svc = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        BluetoothGattCharacteristic rx = new BluetoothGattCharacteristic(
            RX,
            BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        );
        txLocal = new BluetoothGattCharacteristic(TX, BluetoothGattCharacteristic.PROPERTY_NOTIFY, BluetoothGattCharacteristic.PERMISSION_READ);
        txLocal.addDescriptor(
            new BluetoothGattDescriptor(CCCD, BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE)
        );
        svc.addCharacteristic(rx);
        svc.addCharacteristic(txLocal);
        // Werbung startet erst, wenn der Dienst steht (onServiceAdded)
        server.addService(svc);
        return true;
    }

    private void startAdvertising() {
        if (advCb != null || !adapter.isEnabled()) return;
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null || !adapter.isMultipleAdvertisementSupported()) {
            emitState("advertise", -1);
            return;
        }
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0)
            .build();
        // Den Bluetooth-Namen des Handys nicht senden, nur den Namen aus der App
        AdvertiseData data = new AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(new ParcelUuid(SERVICE))
            .build();
        AdvertiseData resp = new AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addManufacturerData(MANUF, advert == null ? new byte[0] : advert)
            .build();
        advCb = new AdvertiseCallback() {
            @Override
            public void onStartFailure(int errorCode) {
                main.post(() -> {
                    advCb = null;
                    emitState("advertise", errorCode);
                });
            }
        };
        try {
            advertiser.startAdvertising(settings, data, resp, advCb);
        } catch (Exception e) {
            advCb = null;
            emitState("advertise", -2);
        }
    }

    private void stopAdvertising() {
        if (advertiser != null && advCb != null) {
            try {
                advertiser.stopAdvertising(advCb);
            } catch (Exception ignored) {}
        }
        advCb = null;
    }

    private void startScan() {
        if (scanCb != null || !adapter.isEnabled()) return;
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            emitState("scan", -1);
            return;
        }
        ScanFilter f = new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build();
        ScanSettings s = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        lastSeen.clear();
        scanCb = new ScanCallback() {
            @Override
            public void onScanResult(int type, ScanResult result) {
                main.post(() -> onFound(result));
            }

            @Override
            public void onScanFailed(int errorCode) {
                main.post(() -> {
                    scanCb = null;
                    emitState("scan", errorCode);
                });
            }
        };
        try {
            scanner.startScan(Collections.singletonList(f), s, scanCb);
        } catch (Exception e) {
            scanCb = null;
            emitState("scan", -2);
        }
    }

    private void stopScan() {
        if (scanner != null && scanCb != null) {
            try {
                scanner.stopScan(scanCb);
            } catch (Exception ignored) {}
        }
        scanCb = null;
    }

    private void onFound(ScanResult result) {
        if (scanCb == null) return;
        ScanRecord rec = result.getScanRecord();
        if (rec == null) return;
        byte[] md = rec.getManufacturerSpecificData(MANUF);
        if (md == null || md.length == 0) return;
        String id = result.getDevice().getAddress();
        long now = System.currentTimeMillis();
        Long last = lastSeen.get(id);
        // höchstens zweimal pro Sekunde je Gerät melden
        if (last != null && now - last < 500) return;
        lastSeen.put(id, now);
        JSObject e = new JSObject();
        e.put("id", id);
        e.put("adv", b64(md));
        e.put("rssi", result.getRssi());
        notifyListeners("found", e);
    }

    // ---------- GATT-Server (Peripheral) ----------

    private final BluetoothGattServerCallback serverCb = new BluetoothGattServerCallback() {
        @Override
        public void onServiceAdded(int status, BluetoothGattService service) {
            main.post(() -> {
                if (status == BluetoothGatt.GATT_SUCCESS) startAdvertising();
                else emitState("server", status);
            });
        }

        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            main.post(() -> {
                if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    mtus.remove(device.getAddress());
                    if (peer != null && peer.getAddress().equals(device.getAddress())) {
                        peer = null;
                        if ("peripheral".equals(sendRole)) failSend("Verbindung getrennt");
                        emitLink("peripheral", "disconnected", device.getAddress(), 0);
                    }
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int mtu) {
            main.post(() -> mtus.put(device.getAddress(), mtu));
        }

        @Override
        public void onDescriptorWriteRequest(
            BluetoothDevice device,
            int requestId,
            BluetoothGattDescriptor descriptor,
            boolean preparedWrite,
            boolean responseNeeded,
            int offset,
            byte[] value
        ) {
            main.post(() -> {
                boolean ok = server != null && CCCD.equals(descriptor.getUuid()) && (peer == null || peer.getAddress().equals(device.getAddress()));
                if (responseNeeded && server != null) {
                    server.sendResponse(device, requestId, ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, offset, value);
                }
                if (!ok) {
                    // schon mit jemand anderem verbunden
                    if (server != null && peer != null && !peer.getAddress().equals(device.getAddress())) server.cancelConnection(device);
                    return;
                }
                if (peer == null) {
                    peer = device;
                    Integer m = mtus.get(device.getAddress());
                    emitLink("peripheral", "connected", device.getAddress(), m == null ? 23 : m);
                }
            });
        }

        @Override
        public void onCharacteristicWriteRequest(
            BluetoothDevice device,
            int requestId,
            BluetoothGattCharacteristic characteristic,
            boolean preparedWrite,
            boolean responseNeeded,
            int offset,
            byte[] value
        ) {
            main.post(() -> {
                boolean ok = server != null && RX.equals(characteristic.getUuid()) && peer != null && peer.getAddress().equals(device.getAddress()) && !preparedWrite && offset == 0;
                if (responseNeeded && server != null) server.sendResponse(device, requestId, ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, 0, null);
                if (ok && value != null) emitPacket("peripheral", value);
            });
        }

        @Override
        public void onNotificationSent(BluetoothDevice device, int status) {
            main.post(() -> {
                if (!"peripheral".equals(sendRole)) return;
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    sendDone++;
                    pump();
                } else failSend("Senden fehlgeschlagen (" + status + ")");
            });
        }
    };

    // ---------- Verbinden (Central) ----------

    @PluginMethod
    public void connect(PluginCall call) {
        String id = call.getString("id");
        main.post(() -> {
            if (id == null || !BluetoothAdapter.checkBluetoothAddress(id)) {
                call.reject("Gerät unbekannt");
                return;
            }
            if (gatt != null || connectCall != null) {
                call.reject("Schon verbunden");
                return;
            }
            // während des Verbindens nicht suchen, das bremst
            stopScan();
            BluetoothDevice dev = adapter.getRemoteDevice(id);
            connectCall = call;
            centralMtu = 23;
            main.postDelayed(connectWatchdog, 20000);
            gatt = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? dev.connectGatt(getContext(), false, gattCb, BluetoothDevice.TRANSPORT_LE)
                : dev.connectGatt(getContext(), false, gattCb);
            if (gatt == null) {
                main.removeCallbacks(connectWatchdog);
                connectCall = null;
                call.reject("Keine Verbindung zum anderen Handy");
            }
        });
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            main.post(() -> {
                if (g != gatt) {
                    g.close();
                    return;
                }
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
                    if (!g.requestMtu(517)) g.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
                    String addr = g.getDevice().getAddress();
                    closeGatt();
                    if (connectCall != null) {
                        main.removeCallbacks(connectWatchdog);
                        PluginCall c = connectCall;
                        connectCall = null;
                        c.reject("Keine Verbindung zum anderen Handy");
                    } else {
                        if ("central".equals(sendRole)) failSend("Verbindung getrennt");
                        emitLink("central", "disconnected", addr, 0);
                    }
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
            main.post(() -> {
                if (g != gatt) return;
                centralMtu = status == BluetoothGatt.GATT_SUCCESS ? mtu : 23;
                g.discoverServices();
            });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            main.post(() -> {
                if (g != gatt) return;
                BluetoothGattService svc = status == BluetoothGatt.GATT_SUCCESS ? g.getService(SERVICE) : null;
                BluetoothGattCharacteristic tx = svc != null ? svc.getCharacteristic(TX) : null;
                rxRemote = svc != null ? svc.getCharacteristic(RX) : null;
                BluetoothGattDescriptor d = tx != null ? tx.getDescriptor(CCCD) : null;
                if (rxRemote == null || d == null) {
                    failConnect("Das Gerät ist kein Shadow-Burn-Handy");
                    return;
                }
                g.setCharacteristicNotification(tx, true);
                boolean ok;
                if (Build.VERSION.SDK_INT >= 33) {
                    ok = g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS;
                } else {
                    d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    ok = g.writeDescriptor(d);
                }
                if (!ok) failConnect("Verbindung fehlgeschlagen");
            });
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor descriptor, int status) {
            main.post(() -> {
                if (g != gatt || connectCall == null) return;
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    failConnect("Das andere Handy ist gerade beschäftigt");
                    return;
                }
                main.removeCallbacks(connectWatchdog);
                PluginCall c = connectCall;
                connectCall = null;
                JSObject r = new JSObject();
                r.put("mtu", centralMtu);
                c.resolve(r);
                emitLink("central", "connected", g.getDevice().getAddress(), centralMtu);
            });
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            byte[] v = value.clone();
            main.post(() -> {
                if (g == gatt && TX.equals(c.getUuid())) emitPacket("central", v);
            });
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            // Ab Android 13 kommt die Variante oben mit dem Wert
            if (Build.VERSION.SDK_INT >= 33) return;
            byte[] v = c.getValue();
            if (v == null) return;
            byte[] copy = v.clone();
            main.post(() -> {
                if (g == gatt && TX.equals(c.getUuid())) emitPacket("central", copy);
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            main.post(() -> {
                if (g != gatt || !"central".equals(sendRole)) return;
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    sendDone++;
                    pump();
                } else failSend("Senden fehlgeschlagen (" + status + ")");
            });
        }
    };

    private void failConnect(String msg) {
        main.removeCallbacks(connectWatchdog);
        closeGatt();
        if (connectCall != null) {
            PluginCall c = connectCall;
            connectCall = null;
            c.reject(msg);
        }
    }

    private void closeGatt() {
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (Exception ignored) {}
        }
        gatt = null;
        rxRemote = null;
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String role = call.getString("role", "all");
        main.post(() -> {
            if ("central".equals(role) || "all".equals(role)) {
                if ("central".equals(sendRole)) failSend("Abgebrochen");
                if (connectCall != null) failConnect("Abgebrochen");
                else closeGatt();
            }
            if ("peripheral".equals(role) || "all".equals(role)) {
                if ("peripheral".equals(sendRole)) failSend("Abgebrochen");
                if (server != null && peer != null) server.cancelConnection(peer);
                peer = null;
            }
            call.resolve();
        });
    }

    // ---------- Senden ----------

    @PluginMethod
    public void send(PluginCall call) {
        String role = call.getString("role", "");
        JSArray arr = call.getArray("packets");
        main.post(() -> {
            if (sendCall != null) {
                call.reject("Senden läuft schon");
                return;
            }
            boolean central = "central".equals(role);
            if (central ? (gatt == null || rxRemote == null) : (server == null || peer == null)) {
                call.reject("Nicht verbunden");
                return;
            }
            ArrayDeque<byte[]> q = new ArrayDeque<>();
            try {
                for (int i = 0; i < arr.length(); i++) q.add(Base64.decode(arr.getString(i), Base64.DEFAULT));
            } catch (Exception e) {
                call.reject("Ungültige Daten");
                return;
            }
            queue = q;
            sendRole = role;
            sendCall = call;
            sendTotal = q.size();
            sendDone = 0;
            retries = 0;
            pump();
        });
    }

    @SuppressWarnings("deprecation")
    private void pump() {
        if (sendCall == null) return;
        main.removeCallbacks(sendWatchdog);
        if (sendDone > 0 && (sendDone % 4 == 0 || sendDone == sendTotal)) {
            JSObject e = new JSObject();
            e.put("role", sendRole);
            e.put("done", sendDone);
            e.put("total", sendTotal);
            notifyListeners("sent", e);
        }
        byte[] next = queue.peek();
        if (next == null) {
            PluginCall c = sendCall;
            sendCall = null;
            sendRole = null;
            queue = null;
            JSObject r = new JSObject();
            r.put("sent", sendDone);
            c.resolve(r);
            return;
        }
        boolean ok;
        try {
            if ("central".equals(sendRole)) {
                if (gatt == null || rxRemote == null) {
                    failSend("Verbindung getrennt");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    ok = gatt.writeCharacteristic(rxRemote, next, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS;
                } else {
                    rxRemote.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    rxRemote.setValue(next);
                    ok = gatt.writeCharacteristic(rxRemote);
                }
            } else {
                if (server == null || peer == null) {
                    failSend("Verbindung getrennt");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    ok = server.notifyCharacteristicChanged(peer, txLocal, false, next) == BluetoothStatusCodes.SUCCESS;
                } else {
                    txLocal.setValue(next);
                    ok = server.notifyCharacteristicChanged(peer, txLocal, false);
                }
            }
        } catch (Exception e) {
            ok = false;
        }
        if (ok) {
            queue.poll();
            retries = 0;
            main.postDelayed(sendWatchdog, 10000);
        } else if (++retries < 50) {
            // Stapel ist gerade voll: kurz warten und nochmal
            main.postDelayed(this::pump, 20);
        } else {
            failSend("Senden fehlgeschlagen");
        }
    }

    private void failSend(String msg) {
        main.removeCallbacks(sendWatchdog);
        if (sendCall == null) return;
        PluginCall c = sendCall;
        sendCall = null;
        sendRole = null;
        queue = null;
        c.reject(msg);
    }

    // ---------- Aufräumen ----------

    private void stopAll() {
        failSend("Abgebrochen");
        if (connectCall != null) failConnect("Abgebrochen");
        stopScan();
        stopAdvertising();
        closeGatt();
        if (server != null) {
            try {
                if (peer != null) server.cancelConnection(peer);
                server.clearServices();
                server.close();
            } catch (Exception ignored) {}
        }
        server = null;
        peer = null;
        mtus.clear();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        // kein Hintergrund-Betrieb: App weg vom Bildschirm = alles aus
        main.post(() -> {
            boolean wasOn = server != null || scanCb != null || gatt != null;
            stopAll();
            if (wasOn) emitState("stopped", 0);
        });
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::stopAll);
        super.handleOnDestroy();
    }

    // ---------- Ereignisse an JS ----------

    private void emitPacket(String role, byte[] v) {
        JSObject e = new JSObject();
        e.put("role", role);
        e.put("data", b64(v));
        notifyListeners("packet", e);
    }

    private void emitLink(String role, String state, String id, int mtu) {
        JSObject e = new JSObject();
        e.put("role", role);
        e.put("state", state);
        e.put("id", id);
        e.put("mtu", mtu);
        notifyListeners("link", e);
    }

    private void emitState(String what, int code) {
        JSObject e = new JSObject();
        e.put("what", what);
        e.put("code", code);
        notifyListeners("state", e);
    }
}
