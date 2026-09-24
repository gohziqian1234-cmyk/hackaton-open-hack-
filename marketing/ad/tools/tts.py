import numpy as np, soundfile as sf, sys, json
from kokoro_onnx import Kokoro
k = Kokoro(sys.argv[4] if len(sys.argv)>4 else 'kokoro-fp16.onnx', 'voices.npz')
k8 = Kokoro('kokoro-q8.onnx', 'voices.npz')
voice, speed, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
lines = [
 "Blind boxes are built on surprise.",
 "But manufacturing thousands, before knowing what people want? That's just guessing.",
 "So LoopBox flips the entire process.",
 "Play the brand's challenge. Win access to the drop.",
 "Then reveal your collectible digitally, before it's manufactured.",
 "Pulled a duplicate? Trade the allocation, before anything physical exists.",
 "Only after demand is confirmed, do we make the real thing.",
 "Brands stop guessing. Collectors keep the surprise.",
 "LoopBox. Keep the surprise. Make only what's wanted.",
]
info=[]
for i,l in enumerate(lines):
    a, sr = k.create(l, voice=voice, speed=speed, lang='en-us')
    if len(a)==0 or np.isnan(a).any() or np.abs(a).max()<0.05:
        a, sr = k8.create(l, voice=voice, speed=speed, lang='en-us'); print('line',i+1,'fell back to q8')
    # trim leading/trailing silence
    idx = np.where(np.abs(a) > 0.01)[0]; a = a[max(0,idx[0]-240):idx[-1]+2400]
    sf.write(f'{out}/vo-{i+1}.wav', a, sr); info.append(round(len(a)/sr,2))
print(voice, speed, info, 'total', round(sum(info),2))
