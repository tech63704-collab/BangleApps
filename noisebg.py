#!/data/data/com.termux/files/usr/bin/python
# Фоновый шумовой дозиметр для Termux: та же логика, что у noise.html
# Запись: termux-microphone-record кусками по CH секунд, декодирование ffmpeg -> 48 кГц моно
import json, os, subprocess, sys, time
import numpy as np

HOME = os.path.expanduser('~/.noisebg'); os.makedirs(HOME, exist_ok=True)
CFG_F, DAY_F, REC = HOME + '/cfg.json', HOME + '/day.json', HOME + '/rec'
FS, CH = 48000, 10
DEF = dict(off=110.0, cal=False, th1=85, thp=105, sumi=30, thh=70)

def rj(f, d):
    try: return json.load(open(f))
    except Exception: return d
def wj(f, v):
    json.dump(v, open(f + '.tmp', 'w'), ensure_ascii=False); os.replace(f + '.tmp', f)

cfg = {**DEF, **rj(CFG_F, {})}
today = lambda: time.strftime('%Y-%m-%d')
def new_day(): return dict(d=today(), dose=0.0, s85=0.0, cov=0.0, a50=False, a100=False, log=[])
day = rj(DAY_F, None)
if not day or day.get('d') != today(): day = new_day()

# ---------- A-weighting gain² (IEC 61672), normalised to 0 dB at 1 kHz ----------
def a2(f):
    f2 = f * f
    r = (12194.0**2 * f2**2) / ((f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194.0**2))
    return r * r
FR = 1200                                    # 25 ms frames
fr = np.fft.rfftfreq(FR, 1 / FS)
W_A = a2(fr) / a2(np.array([1000.0]))[0]
W_A[0] = 0
W_H = (fr >= 16000).astype(float)            # HF band 16 kHz .. Nyquist
SC = np.full(len(fr), 2.0); SC[0] = 1; SC[-1] = 1  # one-sided spectrum -> Parseval
ALPHA = 1 - np.exp(-0.025 / 0.125)           # LAF fast time weighting

db = lambda ms: 10 * np.log10(ms) + cfg['off'] if ms > 0 else float('-inf')
T = lambda L: 480 * 60 / 2 ** ((L - 85) / 3)    # NIOSH allowed seconds at L
fmtT = lambda s: '>24ч' if s >= 86400 else f'{s/3600:.1f}ч' if s >= 3600 else f'{round(s/60)}мин'

st = dict(y=0.0, recent=[], sesmax=float('-inf'), hf=[], tone=None, tone_since=0, tone_p=0,
          mink=None, minE=0.0, minN=0, last_sum=time.time() - cfg['sumi'] * 60 + 90, last_wall=0, gap='', clip=False)
lastA = {}

def notify(key, title, body, cool):
    now = time.time()
    if cool and key in lastA and now - lastA[key] < cool: return
    lastA[key] = now
    day['log'] = ([time.strftime('%H:%M') + '  ' + title + ' — ' + body] + day['log'])[:50]
    subprocess.Popen(['termux-notification', '--id', 'noise-' + key, '--title', title, '--content', body,
                      '--priority', 'high', '--vibrate', '400,150,400', '--group', 'noisebg'],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def stats():
    e = sum(r[0] for r in st['recent']); n = sum(r[1] for r in st['recent'])
    l1 = db(e / n) if n else float('nan'); d = day['dose']; ok = np.isfinite(l1)
    lex = f'{85 + 10*np.log10(d/100):.0f}' if d > 0.01 else '—'
    rem = 'исчерпано' if d >= 100 else fmtT(T(l1) * (100 - d) / 100) if ok and l1 >= 80 else '∞'
    lv = f'{l1:.0f}' if ok else '—'
    zone = 'нет данных' if not ok else 'ОПАСНО' if l1 >= 85 else 'громко' if l1 >= 70 else 'умеренно' if l1 >= 55 else 'тихо'
    hf = sum(r[0] for r in st['hf']); hn = sum(r[1] for r in st['hf']); hfl = db(hf / hn) if hn else float('nan')
    title = f'{lv} дБА {zone} · доза {d:.1f}%' if d < 10 else f'{lv} дБА {zone} · доза {d:.0f}%'
    body = (f"LAeq1м {lv} | макс {st['sesmax']:.0f} | " if np.isfinite(st['sesmax']) else f'LAeq1м {lv} | макс — | ') + \
           f"LEX8ч {lex} | до 100%: {rem} | ≥85: {int(day['s85']//60)}мин | замер {fmtT(day['cov'])} | " + \
           (f'ВЧ {hfl:.0f}' if np.isfinite(hfl) else 'ВЧ —') + \
           (f" тон {st['tone']/1000:.1f}кГц" if st['tone'] else '') + st['gap'] + \
           (' | КЛИП' if st['clip'] else '') + ('' if cfg['cal'] else ' | без калибр.')
    return title, body, hfl

def tones(x, t0):
    """near-ultrasound tone: strongest bin 16 kHz..Nyquist-300 vs band median, every 0.5 s"""
    N = 4096; w = np.hanning(N); bw = FS / N; i0 = int(np.ceil(16000 / bw)); i1 = int((FS / 2 - 300) // bw)
    for k in range(0, len(x) - N, FS // 2):
        s = np.abs(np.fft.rfft(x[k:k + N] * w)) * 2 / w.sum()
        sp = 20 * np.log10(s[i0:i1 + 1] + 1e-12); mi = int(np.argmax(sp)); prom = sp[mi] - np.median(sp)
        now = t0 + k / FS
        if prom >= 18 and sp[mi] > -100:
            f = (i0 + mi) * bw
            if not st['tone'] or abs(st['tone'] - f) > bw * 3: st['tone_since'] = now
            st['tone'] = f; st['tone_p'] = prom
        else:
            st['tone'] = None
        if st['tone'] and now - st['tone_since'] >= 5:
            t, b, hfl = stats()
            if np.isfinite(hfl) and hfl >= cfg['thh']:
                notify('hf', f"ВЧ-ТОН {st['tone']/1000:.1f} кГц", b, 600)

def process(x, t0):
    global day
    if day['d'] != today(): day = new_day()
    now = time.time()
    if st['last_wall'] and t0 - st['last_wall'] > 30:
        g = round((t0 - st['last_wall']) / 60); st['gap'] = f' | ПРОПУСК {g}мин'
        day['log'] = ([time.strftime('%H:%M') + f'  ПРОПУСК {int(t0 - st["last_wall"])} с'] + day['log'])[:50]
    nf = len(x) // FR
    if nf < 4: return
    X = x[:nf * FR].reshape(nf, FR)
    P = (np.abs(np.fft.rfft(X, axis=1)) ** 2) * SC / FR ** 2      # per-frame mean-square spectrum
    eA = (P * W_A).sum(1); eH = (P * W_H).sum(1)                   # A-weighted and HF mean-square per frame
    pk = np.abs(X).max(1)
    if pk.max() >= 0.98: st['clip'] = True
    for b in range(0, nf - 3, 4):                                  # 0.1 s blocks, like the page
        tb = t0 + b * FR / FS; e = float(eA[b:b + 4].sum()) * FR; n = 4 * FR
        fm = 0.0
        for v in eA[b:b + 4]:
            st['y'] += ALPHA * (v - st['y']); fm = max(fm, st['y'])
        L, laf = db(e / n), db(fm); dt = n / FS
        day['cov'] += dt
        if L >= 80: day['dose'] += dt / T(L) * 100
        if L >= 85: day['s85'] += dt
        st['recent'].append((e, n)); st['recent'] = st['recent'][-600:]
        st['hf'].append((float(eH[b:b + 4].sum()) * FR, n)); st['hf'] = st['hf'][-10:]
        st['sesmax'] = max(st['sesmax'], laf)
        mk = int(tb // 60)
        if st['mink'] is None: st['mink'] = mk
        if mk != st['mink']:
            if st['minN'] > FS * 5:
                lm = db(st['minE'] / st['minN'])
                if lm >= cfg['th1']:
                    t, bd, _ = stats(); notify('leq', f"ШУМ {lm:.0f} дБА ≥{cfg['th1']}", bd, 900)
            st['mink'], st['minE'], st['minN'] = mk, 0.0, 0
        st['minE'] += e; st['minN'] += n
        if laf >= cfg['thp']:
            t, bd, _ = stats(); notify('pk', f'ПИК {laf:.0f} дБА', bd, 600)
    tones(x, t0)
    if day['dose'] >= 50 and not day['a50']:
        day['a50'] = True; t, bd, _ = stats(); notify('d50', 'ДОЗА 50% (NIOSH)', bd, 0)
    if day['dose'] >= 100 and not day['a100']:
        day['a100'] = True; t, bd, _ = stats(); notify('d100', 'ДОЗА 100%: защити слух', bd, 0)
    if cfg['sumi'] > 0 and now - st['last_sum'] >= cfg['sumi'] * 60:
        st['last_sum'] = now; t, bd, _ = stats(); notify('sum', t, bd, 0); st['gap'] = ''; st['clip'] = False
    st['last_wall'] = t0 + len(x) / FS
    wj(DAY_F, day)
    t, bd, _ = stats()
    open(HOME + '/now.txt', 'w').write(time.strftime('%H:%M:%S ') + t + '\n' + bd + '\n')

# ---------- recording ----------
def api(*a, timeout=15):
    try: return subprocess.run(a, capture_output=True, text=True, timeout=timeout).stdout
    except Exception: return ''
def recording():
    try: return json.loads(api('termux-microphone-record', '-i') or '{}').get('isRecording', False)
    except Exception: return False
def start_rec(f):
    if os.path.exists(f): os.remove(f)
    api('termux-microphone-record', '-f', f, '-l', str(CH), '-e', 'aac', '-b', '256000', '-r', str(FS), '-c', '1')
def decode(f):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 's16le', '-ac', '1', '-ar', str(FS), '-'],
                       capture_output=True, timeout=60)
    return np.frombuffer(r.stdout, dtype='<i2').astype(np.float64) / 32768.0

def capture_once(f):
    t0 = time.time(); start_rec(f); time.sleep(CH * 0.9)
    for _ in range(100):
        if not recording(): break
        time.sleep(0.2)
    return t0

def main():
    api('termux-wake-lock')
    api('termux-microphone-record', '-q')
    i = 0; prev = None
    while True:
        f = f'{REC}{i % 2}.m4a'
        t0 = capture_once(f) if prev is None else None
        if prev is None:
            prev = (f, t0); i += 1; continue
        # start next chunk first, then analyse the finished one while it records
        nf = f'{REC}{i % 2}.m4a'; tn = time.time(); start_rec(nf)
        try:
            x = decode(prev[0])
            if len(x): process(x, prev[1])
        except Exception as e:
            open(HOME + '/err.log', 'a').write(time.strftime('%F %T ') + repr(e) + '\n')
        while time.time() - tn < CH * 0.9: time.sleep(0.2)
        for _ in range(100):
            if not recording(): break
            time.sleep(0.2)
        prev = (nf, tn); i += 1

def calibrate(ref):
    f = REC + 'cal.m4a'; capture_once(f); x = decode(f)
    nf = len(x) // FR; X = x[:nf * FR].reshape(nf, FR)
    P = (np.abs(np.fft.rfft(X, axis=1)) ** 2) * SC / FR ** 2; m = float((P * W_A).sum(1)[nf // 4:].mean())
    cfg['off'] = round(ref - 10 * np.log10(m), 1); cfg['cal'] = True; wj(CFG_F, cfg)
    print(f"Поправка = {cfg['off']} дБ (сохранено). Уже накопленная доза не пересчитана.")

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] == 'run': main()
    elif a[0] == 'cal': calibrate(float(a[1]))
    elif a[0] == 'set': cfg[a[1]] = float(a[2]); wj(CFG_F, cfg); print(cfg)
    elif a[0] == 'now': print(open(HOME + '/now.txt').read() if os.path.exists(HOME + '/now.txt') else 'нет данных')
    elif a[0] == 'test':
        t, b, _ = stats(); notify('sum', 'ТЕСТ: ' + t, b, 0); time.sleep(2); print('отправлено')
