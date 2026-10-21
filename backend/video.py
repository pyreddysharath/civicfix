"""Bounded silent-video processing. Reject failed or unavailable moderation."""
import base64, binascii, io, json, math, os, subprocess, tempfile, urllib.request, urllib.error
from pathlib import Path
from PIL import Image

class VideoError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status=status

def run(args):
    try:
        return subprocess.run(args, check=True, capture_output=True, timeout=45).stdout
    except FileNotFoundError:
        raise VideoError('Video processing is not configured on the server.',503)
    except (subprocess.SubprocessError, OSError):
        raise VideoError('Cannot process this video. Use a valid MP4, MOV or WebM up to 10 seconds.')

def moderate_frames(frames):
    key=os.environ.get('OPENAI_API_KEY')
    if not key: raise VideoError('Media safety screening is not configured. Nothing was saved.',503)
    inputs=[{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(f).decode()}} for f in frames]
    request=urllib.request.Request('https://api.openai.com/v1/moderations',
        json.dumps({'model':'omni-moderation-latest','input':inputs}).encode(),
        {'Content-Type':'application/json','Authorization':'Bearer '+key})
    try:
        with urllib.request.urlopen(request,timeout=40) as response: result=json.load(response)
        results=result['results']
        if not isinstance(results,list) or not results or any(not isinstance(r,dict) or type(r.get('flagged')) is not bool for r in results): raise ValueError()
    except (urllib.error.URLError,TimeoutError,ValueError,KeyError,TypeError):
        raise VideoError('Media safety screening is unavailable. Nothing was saved; please retry.',503)
    if any(r['flagged'] for r in results):
        raise VideoError('This video did not pass safety screening. Choose another video.',422)

def clean_video(value):
    try:
        header,encoded=value.split(',',1)
        if header not in ('data:video/mp4;base64','data:video/webm;base64','data:video/quicktime;base64') or len(encoded)>14_000_000: raise ValueError()
        raw=base64.b64decode(encoded,validate=True)
        if not raw or len(raw)>10*1024*1024: raise ValueError()
    except (ValueError,binascii.Error,AttributeError):
        raise VideoError('Use an MP4, MOV or WebM under 10 MB.')
    with tempfile.TemporaryDirectory(prefix='nenu-video-') as directory:
        root=Path(directory); source=root/'input'; source.write_bytes(raw); output=root/'output.mp4'
        probe=json.loads(run(['ffprobe','-v','error','-protocol_whitelist','file,pipe',
            '-format_whitelist','mov,matroska,webm','-show_format','-show_streams','-of','json',str(source)]))
        try:
            streams=probe['streams']; videos=[s for s in streams if s['codec_type']=='video']
            durations=[float(probe['format']['duration'])]+[float(s['duration']) for s in streams if s.get('duration') not in (None,'N/A')]
            if len(videos)!=1 or any(not math.isfinite(d) or d<=0 or d>10 for d in durations): raise ValueError()
            if not 16<=videos[0]['width']<=4096 or not 16<=videos[0]['height']<=4096: raise ValueError()
        except (KeyError,TypeError,ValueError):
            raise VideoError('Video must be at most 10 seconds with dimensions between 16 and 4096 pixels.')
        run(['ffmpeg','-v','error','-nostdin','-threads','2','-protocol_whitelist','file,pipe',
            '-format_whitelist','mov,matroska,webm','-i',str(source),'-map','0:v:0','-an',
            '-map_metadata','-1','-vf','scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30',
            '-c:v','libx264','-threads','2','-preset','fast','-crf','28','-pix_fmt','yuv420p',
            '-movflags','+faststart','-fs','6500000',str(output)])
        if output.stat().st_size>=6_000_000: raise VideoError('Video is too large after processing. Use a smaller clip.')
        # Sample twice per second, plus first and final frames. Sampling can miss brief content.
        run(['ffmpeg','-v','error','-nostdin','-i',str(output),'-vf','fps=2','-frames:v','20',str(root/'frame-%02d.jpg')])
        run(['ffmpeg','-v','error','-nostdin','-i',str(output),'-frames:v','1',str(root/'first.jpg')])
        run(['ffmpeg','-v','error','-nostdin','-sseof','-0.1','-i',str(output),'-frames:v','1',str(root/'last.jpg')])
        frames=[p.read_bytes() for p in sorted(root.glob('*.jpg'))]
        if not frames: raise VideoError('Video has no readable frames.')
        moderate_frames(frames)
        im=Image.open(io.BytesIO(frames[0])).convert('RGB');im.thumbnail((240,240))
        thumb=io.BytesIO();im.save(thumb,'JPEG',quality=65)
        return output.read_bytes(),'data:image/jpeg;base64,'+base64.b64encode(thumb.getvalue()).decode()
