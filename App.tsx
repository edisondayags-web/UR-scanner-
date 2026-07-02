import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
View, Text, StyleSheet, TouchableOpacity, Modal, Alert, Linking,
SafeAreaView, StatusBar, ScrollView, ImageBackground, Dimensions,
Platform, TextInput, ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevices, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { MMKV } from 'react-native-mmkv';
import { FlashList } from '@shopify/flash-list';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-chart-kit';
import Animated, {
useSharedValue, withTiming, withRepeat, useAnimatedStyle, Easing,
cancelAnimation, runOnJS, FadeIn, FadeOut,
} from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import DeviceInfo from 'react-native-device-info';
import JailMonkey from 'jail-monkey';

import firebase from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

import {
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID,
} from '@env';

const { width, height } = Dimensions.get('window');
const storage = new MMKV();

let bgImage;
try {
bgImage = require('./assets/hoodie-bg.png');
} catch {
bgImage = { uri: 'https://via.placeholder.com/500' };
}

function triggerHaptic(style: 'light' | 'heavy' = 'light') {
try {
Haptics.impactAsync(style === 'heavy'? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
} catch {}
}

if (!firebase.apps.length) {
firebase.initializeApp({
apiKey: FIREBASE_API_KEY,
authDomain: FIREBASE_AUTH_DOMAIN,
projectId: FIREBASE_PROJECT_ID,
storageBucket: FIREBASE_STORAGE_BUCKET,
messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
appId: FIREBASE_APP_ID,
});
}

const db = firestore();
const Crashlytics = {
log: (msg: string) => { if (DEV) console.log('[LOG]', msg); crashlytics().log(msg); },
recordError: (err: Error) => { if (DEV) console.error('[ERROR]', err); crashlytics().recordError(err); },
setUserId: (id: string) => {
crashlytics().setUserId(id);
crashlytics().setAttributes({ platform: Platform.OS, version: DeviceInfo.getVersion(), build: DeviceInfo.getBuildNumber() });
},
};

const brandPink = '#FF4D8D';

const WALLETS_RAW = [
{ name: 'BDO', deeplink: 'bdo://', fallback: 'https://www.bdo.com.ph/personal/digital-banking/mobile-banking', store: 'com.bdo.unibank', color: '#0033A0' },
{ name: 'BPI', deeplink: 'bpi://', fallback: 'https://www.bpi.com.ph/personal/bank/online', store: 'com.bpi.mobile', color: '#A12830' },
{ name: 'Chinabank', deeplink: 'chinabank://', fallback: 'https://www.chinabank.ph', store: 'com.chinabank.mobile', color: '#E31837' },
{ name: 'GCash', deeplink: 'gcash://qrcode/scan', fallback: 'https://www.gcash.com', store: 'com.globe.gcash.android', color: '#007DFE' },
{ name: 'GrabPay', deeplink: 'grab://', fallback: 'https://www.grab.com/ph/pay/', store: 'com.grabtaxi.passenger', color: '#00B14F' },
{ name: 'Landbank', deeplink: 'landbank://', fallback: 'https://www.landbank.com', store: 'com.landbank.mobile', color: '#006937' },
{ name: 'Maya', deeplink: 'maya://qr', fallback: 'https://www.maya.ph', store: 'com.paymaya', color: '#00D631' },
{ name: 'Metrobank', deeplink: 'metrobank://', fallback: 'https://metrobank.com.ph', store: 'com.metrobank.mobile', color: '#002A5C' },
{ name: 'PNB', deeplink: 'pnb://', fallback: 'https://www.pnb.com.ph', store: 'com.pnb.mobile', color: '#0066B3' },
{ name: 'RCBC', deeplink: 'rcbc://', fallback: 'https://www.rcbc.com', store: 'com.rcbc.mobile', color: '#003087' },
{ name: 'Security Bank', deeplink: 'securitybank://', fallback: 'https://www.securitybank.com', store: 'com.securitybank.mobile', color: '#009CDE' },
{ name: 'ShopeePay', deeplink: 'shopee://', fallback: 'https://shopee.ph', store: 'com.shopee.ph', color: '#EE4D2D' },
{ name: 'UnionBank', deeplink: 'unionbank://', fallback: 'https://www.unionbankph.com', store: 'com.unionbank.ph', color: '#FF7F00' },
];
const WALLET_MAP = new Map(WALLETS_RAW.map((w) => [w.name, w]));

const FIREWALL = { MIN_INTERVAL_MS: 5000, MAX_DAILY_CLICKS: 100, DAILY_KEY: 'daily_clicks', DAILY_DATE_KEY: 'daily_clicks_date', LAST_CLICK_KEY: 'lastClickTime' };
const MAX_QR_HISTORY = 100;

async function firewallAllow() {
const now = Date.now();
try {
const lastClick = storage.getString(FIREWALL.LAST_CLICK_KEY);
const savedDate = storage.getString(FIREWALL.DAILY_DATE_KEY);
const dailyClicksRaw = storage.getString(FIREWALL.DAILY_KEY);
if (lastClick && now - parseInt(lastClick, 10) < FIREWALL.MIN_INTERVAL_MS) {
Alert.alert('Dahan-dahan lang', 'Maghintay ng 5 segundo bago ulit mag-select.');
return false;
}
const today = new Date().toISOString().slice(0, 10);
let dailyClicks = parseInt(dailyClicksRaw || '0', 10);
if (savedDate!== today) { dailyClicks = 0; storage.set(FIREWALL.DAILY_DATE_KEY, today); }
if (dailyClicks >= FIREWALL.MAX_DAILY_CLICKS) { Alert.alert('Daily limit reached', 'Bumalik bukas.'); return false; }
storage.set(FIREWALL.LAST_CLICK_KEY, now.toString());
storage.set(FIREWALL.DAILY_KEY, (dailyClicks + 1).toString());
return true;
} catch (e) { Crashlytics.recordError(e); return true; }
}

function getEMVTag(data: string, tag: string): string | null {
let i = 0;
const len_ = data.length;
while (i < len_ - 4) {
const id = data.substr(i, 2);
const len = parseInt(data.substr(i + 2, 2), 10);
if (isNaN(len)) break;
if (id === tag) return data.substr(i + 4, len);
i += 4 + len;
}
return null;
}

function extractMerchantName(qrData: string): string {
try {
const name = getEMVTag(qrData, '59');
return name && name.trim()? name.trim() : 'Merchant';
} catch (e) { Crashlytics.recordError(e); return 'Merchant'; }
}

const CRC_TABLE = (() => {
const table = new Uint16Array(256);
for (let n = 0; n < 256; n++) {
let c = n << 8;
for (let k = 0; k < 8; k++) { c = (c & 0x8000)? ((c << 1) ^ 0x1021) : (c << 1); }
table[n] = c & 0xffff;
}
return table;
})();

function crc16ccitt(data: string): string {
let crc = 0xffff;
for (let i = 0; i < data.length; i++) {
const idx = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
crc = ((crc << 8) ^ CRC_TABLE[idx]) & 0xffff;
}
return crc.toString(16).toUpperCase().padStart(4, '0');
}

function isValidQRPH(data: string): boolean {
if (!data || data.length > 1024 || data.length < 10) return false;
try {
if (!data.startsWith('000201')) return false;
if (getEMVTag(data, '63') === null) return false;
const payloadWithoutCrc = data.slice(0, -4);
const declaredCrc = data.slice(-4).toUpperCase();
const computedCrc = crc16ccitt(payloadWithoutCrc + '6304');
if (declaredCrc!== computedCrc) return false;
if (getEMVTag(data, '58')!== 'PH') return false;
if (getEMVTag(data, '53')!== '608') return false;
return true;
} catch { return false; }
}

type TimeFilter = 'Today' | '7 Days' | '30 Days' | 'All Time';
type MerchantUI = { rank: number; name: string; scans: number; color: string; pct: string; };
type QRHistoryItem = { name: string; data: string; date: string; };
type SortType = 'newest' | 'oldest' | 'merchant';

const PinkFadeText: React.FC<{ children: React.ReactNode; style?: any; size?: number; weight?: any; spacing?: number; }> = ({ children, style, size = 16, weight = '500', spacing = 0 }) => (
<LinearGradient colors={['#FF4D8D', '#000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
<Text style={[styles.gradientText, { fontSize: size, fontWeight: weight, letterSpacing: spacing }]}>{children}</Text>
</LinearGradient>
);

const PinkFadeIcon: React.FC<{ children: React.ReactNode; bgColor?: string; }> = ({ children, bgColor = '#FF4D8D' }) => (
<LinearGradient colors={[bgColor, '#000']} style={[styles.iconGradient, {borderRadius: 20}]}>
{children}
</LinearGradient>
);

const MerchantRow: React.FC<{ item: MerchantUI }> = React.memo(({ item }) => (
<View style={styles.merchantRow}>
<Text style={styles.rank}>{item.rank}</Text>
<PinkFadeIcon bgColor={item.color}><Text style={styles.merchantIcon}>{item.name[0]}</Text></PinkFadeIcon>
<View style={{flex:1}}><Text style={styles.merchantName}>{item.name}</Text><Text style={styles.merchantSub}>{item.scans} scans</Text></View>
<View style={styles.barBg}><View style={[styles.bar, {width: item.pct}]} /></View>
<Text style={styles.pct}>{item.pct}</Text>
<Icon name="chevron-forward" size={18} color="#666" />
</View>
));

export default function App() {
const { hasPermission, requestPermission } = useCameraPermission();
const devices = useCameraDevices('wide-angle-camera');
const device = devices.back;

const format = useMemo(() => {
if (!device) return undefined;
return device.formats
.filter(f => f.videoWidth >= 3840 && f.videoHeight >= 2160)
.sort((a, b) => b.videoWidth - a.videoWidth)[0] || device.formats[0];
}, [device]);

const fps = useMemo(() => {
if (!format) return 30;
return format.maxFps >= 60? 60 : format.maxFps;
}, [format]);

const [showSettings, setShowSettings] = useState(false);
const [showLiveStats, setShowLiveStats] = useState(false);
const [showAllMerchants, setShowAllMerchants] = useState(false);
const [showAbout, setShowAbout] = useState(false);
const [showPrivacy, setShowPrivacy] = useState(false);
const [showQRList, setShowQRList] = useState(false);
const [showWalletSelect, setShowWalletSelect] = useState(false);
const [showLoadingWallet, setShowLoadingWallet] = useState(false);
const [currentQR, setCurrentQR] = useState<string | null>(null);
const [savedQRs, setSavedQRs] = useState<QRHistoryItem[]>([]);
const [liveStats, setLiveStats] = useState<any>({});
const [timeFilter, setTimeFilter] = useState<TimeFilter>('Today');
const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
const [torchOn, setTorchOn] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [sortType, setSortType] = useState<SortType>('newest');
const [chartData, setChartData] = useState({ labels: ['No Data'], datasets: [{ data: [0] }] });
const [onlineUsers, setOnlineUsers] = useState(0);

const scanLockRef = useRef(false);
const lastScannedDataRef = useRef('');
const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
const isMountedRef = useRef(true);
const scale = useSharedValue(1);
const scanSuccessScale = useSharedValue(0);
const lottieRef = useRef<LottieView>(null);

useEffect(() => {
isMountedRef.current = true;
if (JailMonkey.isJailBroken()) { Alert.alert('Security Warning', 'This device appears to be rooted/jailbroken.'); Crashlytics.log('Jailbroken device'); }
if (DeviceInfo.isEmulatorSync()) { Alert.alert('Emulator Detected', 'Please use a physical device.'); }

(async () => {  
  if (!hasPermission) await requestPermission();  
  loadSavedQRs();  
  Crashlytics.setUserId(DeviceInfo.getUniqueIdSync());  
  Crashlytics.log('UR Scanner launched');  
  await analytics().logEvent('app_open');  
  retryPendingUploads();  
})();  

scale.value = withRepeat(withTiming(1.05, { duration: 5000, easing: Easing.inOut(Easing.sin) }), -1, true);  
const unsubscribeNetInfo = NetInfo.addEventListener(state => { if (state.isConnected) retryPendingUploads(); });  

return () => {  
  isMountedRef.current = false;  
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);  
  cancelAnimation(scale);  
  cancelAnimation(scanSuccessScale);  
  unsubscribeNetInfo();  
};

}, []);

useEffect(() => {
const unsubStats = db.collection('live_stats').doc('summary').onSnapshot(
(snap) => { if (isMountedRef.current && snap.exists) setLiveStats(snap.data()); },
(err) => Crashlytics.recordError(err)
);
const unsubOnline = db.collection('presence').onSnapshot(
(snap) => { if (isMountedRef.current) setOnlineUsers(snap.size); },
(err) => Crashlytics.recordError(err)
);
const userId = DeviceInfo.getUniqueIdSync();
db.collection('presence').doc(userId).set({ lastSeen: firestore.FieldValue.serverTimestamp(), platform: Platform.OS });

return () => { unsubStats(); unsubOnline(); db.collection('presence').doc(userId).delete(); };

}, []);

useEffect(() => {
const loadChartData = async () => {
try {
const days = timeFilter === 'Today'? 1 : timeFilter === '7 Days'? 7 : timeFilter === '30 Days'? 30 : 365;
const startDate = new Date();
startDate.setDate(startDate.getDate() - days);
const snapshot = await db.collection('scan_logs').where('timestamp', '>=', startDate).orderBy('timestamp', 'asc').get();
const dataPoints = new Map();
snapshot.docs.forEach(doc => {
const data = doc.data();
const date = data.timestamp.toDate();
const key = timeFilter === 'Today'? ${date.getHours()}:00 : timeFilter === '7 Days'? date.toLocaleDateString('en-US', { weekday: 'short' }) : Wk${Math.ceil(date.getDate() / 7)};
dataPoints.set(key, (dataPoints.get(key) || 0) + 1);
});
const labels = Array.from(dataPoints.keys());
const data = Array.from(dataPoints.values());
if (isMountedRef.current) setChartData({ labels: labels.length? labels : ['No Data'], datasets: [{ data: data.length? data : [0] }] });
} catch (e) { Crashlytics.recordError(e); }
};
loadChartData();
}, [timeFilter]);

const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
const scanSuccessStyle = useAnimatedStyle(() => ({ transform: [{ scale: scanSuccessScale.value }], opacity: scanSuccessScale.value }));

const loadSavedQRs = useCallback(async () => {
try { const raw = storage.getString('qr_list'); if (raw) setSavedQRs(JSON.parse(raw)); } catch (e) { Crashlytics.recordError(e); }
}, []);

const saveQRToList = useCallback(async (qrData: string) => {
try {
const raw = storage.getString('qr_list');
let list: QRHistoryItem[] = raw? JSON.parse(raw) : [];
if (list.some((i) => i.data === qrData)) return;
list.unshift({ name: extractMerchantName(qrData), data: qrData, date: new Date().toISOString() });
if (list.length > MAX_QR_HISTORY) list = list.slice(0, MAX_QR_HISTORY);
storage.set('qr_list', JSON.stringify(list));
setSavedQRs(list);
} catch (e) { Crashlytics.recordError(e); }
}, []);

const retryPendingUploads = useCallback(async () => {
try {
const raw = storage.getString('pending_clicks');
if (!raw) return;
const pending = JSON.parse(raw);
if (!pending.length) return;
for (const item of pending) {
try {
const field = 'selected_' + item.wallet.replace(/\s/g, '_');
await db.collection('live_stats').doc('summary').update({ total_app_select_clicks: firestore.FieldValue.increment(1), [field]: firestore.FieldValue.increment(1) });
} catch (err) { Crashlytics.recordError(err); return; }
storage.delete('pending_clicks');
} catch (e) { Crashlytics.recordError(e); }
}, []);

const codeScanner = useCodeScanner({
codeTypes: ['qr'],
onCodeScanned: (codes) => {
'worklet';
if (scanLockRef.current ||!codes.length) return;
const data = codes[0].value;
if (!data || data === lastScannedDataRef.current) return;
runOnJS(setCurrentQR)(data);
runOnJS(saveQRToList)(data);
runOnJS(setShowWalletSelect)(true);
runOnJS(setLastUpdated)(new Date().toLocaleString());
scanSuccessScale.value = withTiming(1.2, { duration: 150 }, () => { scanSuccessScale.value = withTiming(0, { duration: 250 }); });
runOnJS(triggerHaptic)('heavy');
runOnJS(lottieRef.current?.play)();
scanLockRef.current = true;
lastScannedDataRef.current = data;
runOnJS(Crashlytics.log)('QR Scanned: ' + extractMerchantName(data));
runOnJS(analytics().logEvent)('qr_scanned', { merchant: extractMerchantName(data) });
runOnJS(db.collection('scan_logs').add)({ merchant: extractMerchantName(data), timestamp: firestore.FieldValue.serverTimestamp(), platform: Platform.OS });
if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
debounceTimerRef.current = setTimeout(() => { scanLockRef.current = false; lastScannedDataRef.current = ''; }, 1500);
},
});

const handleWalletSelect = useCallback(async (walletName: string) => {
triggerHaptic();
const allowed = await firewallAllow();
if (!allowed) return;
setShowWalletSelect(false);
setShowLoadingWallet(true);
try {
Crashlytics.log('User selected: ' + walletName);
await analytics().logEvent('wallet_select', { wallet: walletName });
const field = 'selected_' + walletName.replace(/\s/g, '');
try {
await db.collection('live_stats').doc('summary').update({ total_app_select_clicks: firestore.FieldValue.increment(1), [field]: firestore.FieldValue.increment(1) });
} catch (err) {
const raw = storage.getString('pending_clicks');
const pending = raw? JSON.parse(raw) : [];
pending.push({ wallet: walletName, timestamp: Date.now() });
storage.set('pending_clicks', JSON.stringify(pending.slice(-50)));
Crashlytics.recordError(err);
}
await db.collection('click_logs').add({ action: 'clicked_open_in' + walletName, merchant: extractMerchantName(currentQR || ''), qr_hash: currentQR? currentQR.slice(-6) : '', timestamp: firestore.FieldValue.serverTimestamp(), platform: Platform.OS, disclaimer: 'User clicked button only. No payment confirmed.' });
const wallet = WALLET_MAP.get(walletName);
const url = walletName === 'QRPH_Default'? 'https://qrph.co?data=' + encodeURIComponent(currentQR || '') : wallet?.deeplink;
if (!url) throw new Error('No deeplink for ' + walletName);
const canOpen = await Linking.canOpenURL(url);
if (canOpen) { await Linking.openURL(url); }
else if (wallet?.fallback) {
const canOpenFallback = await Linking.canOpenURL(wallet.fallback);
if (canOpenFallback) { await Linking.openURL(wallet.fallback); }
else { await Linking.openURL('market://details?id=' + (wallet?.store || '')); }
} else { await Linking.openURL('market://details?id=' + (wallet?.store || '')); }
} catch (err) { Crashlytics.recordError(err); Alert.alert('Error', 'Hindi ma-open ang app. Subukan ulit.'); }
finally { setShowLoadingWallet(false); }
}, [currentQR]);

const deleteQR = useCallback(async (index: number) => {
triggerHaptic();
try {
setSavedQRs((prev) => { const list = [...prev]; list.splice(index, 1); storage.set('qr_list', JSON.stringify(list)); return list; });
} catch (e) { Crashlytics.recordError(e); }
}, []);

const openQR = useCallback((qrData: string) => { triggerHaptic(); setCurrentQR(qrData); setShowWalletSelect(true); }, []);

const allMerchants: MerchantUI[] = useMemo(() => {
const merchants: any = {};
WALLETS_RAW.forEach(w => { const key = 'selected_' + w.name.replace(/\s/g, '_'); merchants[w.name] = { scans: liveStats[key] || 0, color: w.color }; });
const sorted = Object.entries(merchants).sort((a: any, b: any) => b[1].scans - a[1].scans).map(([name, data]: any, i) => ({ rank: i + 1, name, scans: data.scans, color: data.color, pct: '0%' }));
const total = sorted.reduce((a, b) => a + b.scans, 0);
return sorted.map(m => ({...m, pct: total > 0? ${((m.scans/total)*100).toFixed(1)}% : '0.0%' }));
}, [liveStats]);

const top3 = useMemo(() => allMerchants.slice(0, 3), [allMerchants]);

const stats = useMemo(() => {
const total = liveStats.total_app_select_clicks || 0;
const successful = Object.keys(liveStats).filter(k => k.startsWith('selected_')).reduce((sum, k) => sum + (liveStats[k] || 0), 0);
return { totalScans: total, successful: successful, todayScans: total, uniqueMerchants: allMerchants.filter(m => m.scans > 0).length, successRate: total > 0? ${((successful/total)*100).toFixed(1)}% : '0.0%' };
}, [liveStats, allMerchants]);

const filteredQRs = useMemo(() => {
let filtered = [...savedQRs];
if (searchQuery) filtered = filtered.filter(qr => qr.name.toLowerCase().includes(searchQuery.toLowerCase()));
if (sortType === 'oldest') filtered.reverse();
else if (sortType === 'merchant') filtered.sort((a, b) => a.name.localeCompare(b.name));
return filtered;
}, [savedQRs, searchQuery, sortType]);

const renderQRItem = useCallback(({ item, index }: any) => (
<TouchableOpacity style={styles.qrItem} onPress={() => openQR(item.data)} activeOpacity={0.7}>
<View style={styles.qrItemLeft}>
<Text style={styles.qrItemName}>{item.name}</Text>
<Text style={styles.qrItemDate}>Saved: {new Date(item.date).toLocaleDateString()}</Text>
</View>
<TouchableOpacity onPress={() => deleteQR(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
<Text style={styles.deleteText}>🗑️</Text>
</TouchableOpacity>
</TouchableOpacity>
), [openQR, deleteQR]);

if (!hasPermission) {
return (
<View style={styles.container}>
<Text style={styles.permText}>Camera permission required</Text>
<TouchableOpacity style={styles.permBtn} onPress={requestPermission}><Text style={styles.permBtnText}>Grant Permission</Text></TouchableOpacity>
<TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}><Text style={styles.permBtnText}>Open Settings</Text></TouchableOpacity>
</View>
);
}

if (!device) {
return <View style={styles.container}><ActivityIndicator size="large" color={brandPink} /><Text style={styles.permText}>Loading 4K camera...</Text></View>;
}

return (
<View style={styles.container}>
<StatusBar barStyle="light-content" backgroundColor="#000" />

{/* CAMERA VIEW - MAIN SCREEN */}  
  <Camera  
    style={StyleSheet.absoluteFill}  
    device={device}  
    isActive={true}  
    codeScanner={codeScanner}  
    format={format}  
    fps={fps}  
    torch={torchOn? 'on' : 'off'}  
    enableBufferCompression={true}  
    videoStabilizationMode="off"  
    photoQualityBalance="quality"  
  />  

  {/* SCAN SUCCESS ANIMATION */}  
  <Animated.View style={[styles.scanSuccessOverlay, scanSuccessStyle]}>  
    <LottieView ref={lottieRef} source={require('./assets/scan-success.json')} style={{ width: 200, height: 200 }} loop={false} />  
  </Animated.View>  

  {/* TOP CONTROLS */}  
  <SafeAreaView style={styles.topControls}>  
    <TouchableOpacity style={styles.controlBtn} onPress={() => { triggerHaptic(); setShowSettings(true); }}>  
      <PinkFadeIcon><Icon name="settings" size={24} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
    </TouchableOpacity>  
    <TouchableOpacity style={styles.controlBtn} onPress={() => { triggerHaptic(); setTorchOn(!torchOn); }}>  
      <PinkFadeIcon><Icon name={torchOn? "flash" : "flash-off"} size={24} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
    </TouchableOpacity>  
  </SafeAreaView>  

  {/* BOTTOM INFO */}  
  <View style={styles.bottomInfo}>  
    <PinkFadeText size={14} weight="600">Point camera at QRPH code</PinkFadeText>  
  </View>  

  {/* SETTINGS MODAL */}  
  <Modal visible={showSettings} animationType="slide" transparent>  
    <View style={styles.container}>  
      <StatusBar barStyle="light-content" backgroundColor="#000" />  
      <ImageBackground source={bgImage} style={styles.bg}>  
        <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle]}><View style={styles.overlay} /></Animated.View>  
        <View style={styles.header}>  
          <PinkFadeIcon><Icon name="settings" size={28} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
          <TouchableOpacity style={styles.qrListBtn} onPress={() => setShowSettings(false)}><PinkFadeText size={14} weight="700">BACK TO CAM</PinkFadeText></TouchableOpacity>  
        </View>  
        <View style={styles.titleWrap}><PinkFadeText size={28} weight="700" spacing={1}>Settings</PinkFadeText><Text style={styles.subtitle}>Manage your app preferences</Text></View>  
        <ScrollView style={styles.menuWrap} showsVerticalScrollIndicator={false}>  
          <TouchableOpacity style={styles.card} onPress={() => setShowLiveStats(true)}>  
            <PinkFadeIcon><MaterialIcon name="chart-bar" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
            <View style={styles.cardText}><Text style={styles.cardTitle}>Live Stats</Text><Text style={styles.cardSubtitle}>View real-time scan statistics and{'\n'}live activity</Text></View>  
            <PinkFadeIcon><Icon name="chevron-forward" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
          </TouchableOpacity>  
          <TouchableOpacity style={styles.card} onPress={() => setShowPrivacy(true)}>  
            <PinkFadeIcon><Icon name="shield-checkmark" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
            <View style={styles.cardText}><Text style={styles.cardTitle}>Privacy Policy</Text><Text style={styles.cardSubtitle}>Read our privacy policy{'\n'}and data practices</Text></View>  
            <PinkFadeIcon><Icon name="chevron-forward" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
          </TouchableOpacity>  
          <TouchableOpacity style={styles.card} onPress={() => setShowAbout(true)}>  
            <PinkFadeIcon><Icon name="information-circle" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
            <View style={styles.cardText}><Text style={styles.cardTitle}>About UR Scanner</Text><Text style={styles.cardSubtitle}>Learn more about the app{'\n'}and its mission</Text></View>  
            <PinkFadeIcon><Icon name="chevron-forward" size={22} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
          </TouchableOpacity>  
          <View style={styles.versionCard}><View><Text style={styles.versionLabel}>Version</Text><PinkFadeText size={22} weight="700">1.0.0</PinkFadeText><Text style={styles.versionSub}>You're using the latest version</Text></View><PinkFadeIcon><Icon name="checkmark-circle" size={32} color="#fff" style={styles.iconPadding} /></PinkFadeIcon></View>  
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}><PinkFadeIcon><Icon name="close" size={20} color="#fff" style={styles.iconPadding} /></PinkFadeIcon><PinkFadeText size={16} weight="600" spacing={0.5}>Close Settings</PinkFadeText></TouchableOpacity>  
        </ScrollView>  
      </ImageBackground>  
    </View>  
  </Modal>  

  {/* ABOUT MODAL - WITH YOUR NAME MYLOVE - PINK TO BLACK FADE */}  
  <Modal visible={showAbout} animationType="slide" transparent>  
    <View style={styles.modalBg}>  
      <ScrollView style={styles.modalCard}>  
        <View style={styles.liveHeader}>  
          <View style={{flexDirection:'row', alignItems:'center', gap:10}}>  
            <PinkFadeIcon><Icon name="information-circle" size={28} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
            <PinkFadeText size={22} weight="700">About UR Scanner</PinkFadeText>  
          </View>  
          <TouchableOpacity onPress={() => setShowAbout(false)}><PinkFadeIcon><Icon name="close" size={20} color="#fff" style={styles.iconPadding} /></PinkFadeIcon></TouchableOpacity>  
        </View>  
        <View style={styles.aboutContent}>  
          <PinkFadeText size={32} weight="700" spacing={1}>UR Scanner</PinkFadeText>  
          <Text style={styles.aboutVersion}>Version 1.0.0</Text>  
          <Text style={styles.aboutDesc}>The fastest QRPH scanner with 4K 60FPS support, bank-grade security, and offline mode.</Text>  

          {/* DEVELOPER NAME SECTION - ETO NA NAME MO MYLOVE WITH PINK BLACK FADE */}  
          <View style={styles.developerSection}>  
            <PinkFadeText size={18} weight="700" spacing={0.5}>  
              EDISON SUCLATAN DAYAGUIT  
            </PinkFadeText>  
            <View style={styles.nameUnderline} />  
            <PinkFadeText size={12} weight="600" spacing={1}>  
              DEVELOPER  
            </PinkFadeText>  
          </View>  

          <View style={styles.featureRow}>  
            <Icon name="flash" size={20} color={brandPink} />  
            <Text style={styles.featureText}>4K 60FPS Scanning</Text>  
          </View>  
          <View style={styles.featureRow}>  
            <Icon name="shield-checkmark" size={20} color={brandPink} />  
            <Text style={styles.featureText}>Bank-Grade Security</Text>  
          </View>  
          <View style={styles.featureRow}>  
            <Icon name="cloud-offline" size={20} color={brandPink} />  
            <Text style={styles.featureText}>Offline Mode Support</Text>  
          </View>  
        </View>  
      </ScrollView>  
    </View>  
  </Modal>  

  {/* PRIVACY MODAL */}  
  <Modal visible={showPrivacy} animationType="slide" transparent>  
    <View style={styles.modalBg}>  
      <ScrollView style={styles.modalCard}>  
        <View style={styles.liveHeader}>  
          <View style={{flexDirection:'row', alignItems:'center', gap:10}}>  
            <PinkFadeIcon><Icon name="shield-checkmark" size={28} color="#fff" style={styles.iconPadding} /></PinkFadeIcon>  
            <PinkFadeText size={22} weight="700">Privacy Policy</PinkFadeText>  
          </View>  
          <TouchableOpacity onPress={() => setShowPrivacy(false)}><PinkFadeIcon><Icon name="close" size={20} color="#fff" style={styles.iconPadding} /></
