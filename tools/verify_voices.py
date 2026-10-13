# Checks the Shorts voice-overs with Whisper (speech to text): what each clip really says, and
# word timings for each whole recording, so a line cut in the wrong place can be re-cut.
import json, os, sys, glob, whisper
V = 'voice/video/voice'
S = json.load(open('video/shorts-script.json'))
m = whisper.load_model(os.environ.get('MODEL', 'small'))
out = {'clips': {}, 'whole': {}}
for vid, v in S.items():
    for lang in ('en', 'hi'):
        for n in range(len(v['lines'])):
            k = f'{vid}-{lang}-{n + 1}'; f = f'{V}/{k}.wav'
            if os.path.exists(f):
                r = m.transcribe(f, language=lang, fp16=False)
                out['clips'][k] = r['text'].strip(); print(k, '|', out['clips'][k], flush=True)
        f = f'{V}/{vid}-{lang}.wav'
        if os.path.exists(f):
            r = m.transcribe(f, language=lang, fp16=False, word_timestamps=True)
            out['whole'][f'{vid}-{lang}'] = [{'w': w['word'], 's': round(w['start'], 2), 'e': round(w['end'], 2)} for seg in r['segments'] for w in seg.get('words', [])]
json.dump(out, open('voice-check.json', 'w'), ensure_ascii=False, indent=1)
