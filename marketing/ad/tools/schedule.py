import soundfile as sf, json, sys
d = sys.argv[1]
durs = [sf.info(f'{d}/vo-{i}.wav').duration for i in range(1,10)]
extra = {2:0.55, 8:0.5}   # breathing room before the switch (line 3) and the tagline (line 9)
starts=[0.45]
for i in range(1,9): starts.append(starts[-1]+durs[i-1]+0.26+extra.get(i,0))
end = starts[8]+durs[8]+1.1
lead = lambda i,x: round(starts[i]-x,3)
shots = {'s1':[0,lead(1,.15)],'s2':[lead(1,.15),lead(2,.4)],'s3':[lead(2,.4),lead(3,.2)],'s4':[lead(3,.2),lead(4,.3)],
 's5a':[lead(4,.3),lead(5,.25)],'s5b':[lead(5,.25),lead(6,.2)],'s6':[lead(6,.2),lead(7,.2)],'s7a':[lead(7,.2),lead(8,.3)],'s7b':[lead(8,.3),round(end,3)]}
json.dump({'vo':[{'start':round(s,3),'dur':round(x,3)} for s,x in zip(starts,durs)],'shots':shots,'end':round(end,3)}, open(sys.argv[2],'w'), indent=1)
print(round(end,2), shots)
