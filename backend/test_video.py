import base64, io, json, os, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import video as v
import test_server
import server as s

def clip(seconds=1):
    with tempfile.TemporaryDirectory() as d:
        path=Path(d)/'clip.mp4'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x240:r=10',
            '-f','lavfi','-i','sine=frequency=440','-t',str(seconds),'-c:v','libx264',
            '-threads','1','-c:a','aac',str(path)],check=True)
        return 'data:video/mp4;base64,'+base64.b64encode(path.read_bytes()).decode()

class VideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.short=clip();cls.long=clip(10.1)
    def test_normalize_screen_thumbnail_and_remove_audio(self):
        with patch.object(v,'moderate_frames') as screen:
            blob,thumb=v.clean_video(self.short)
        self.assertEqual(blob[4:8],b'ftyp');self.assertTrue(thumb.startswith('data:image/jpeg;'))
        self.assertGreaterEqual(len(screen.call_args.args[0]),2)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'out.mp4';path.write_bytes(blob)
            probe=json.loads(v.run(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))
            self.assertEqual([x['codec_type'] for x in probe['streams']],['video'])
    def test_overlong_and_corrupt_rejected_before_screening(self):
        with patch.object(v,'moderate_frames') as screen:
            for value in [self.long,'data:video/mp4;base64,YmFk','data:video/avi;base64,YmFk']:
                with self.subTest(value=value[:40]),self.assertRaises(v.VideoError):v.clean_video(value)
            screen.assert_not_called()
    def test_moderation_contract(self):
        for result,status in [({'results':[{'flagged':False}]},None),({'results':[{'flagged':True}]},422),({'results':[{'flagged':'false'}]},503),({'results':[]},503),({},503),({'results':[None]},503)]:
            with self.subTest(result=result),patch.dict(os.environ,{'OPENAI_API_KEY':'test'}),patch.object(v.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
                if status:
                    with self.assertRaises(v.VideoError) as e:v.moderate_frames([b'jpeg'])
                    self.assertEqual(e.exception.status,status)
                else:v.moderate_frames([b'jpeg'])
    def test_unavailable_blocks(self):
        with patch.dict(os.environ,{},clear=True),self.assertRaises(v.VideoError):v.moderate_frames([b'jpeg'])
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test'}),patch.object(v.urllib.request,'urlopen',side_effect=TimeoutError()),self.assertRaises(v.VideoError):v.moderate_frames([b'jpeg'])

class VideoPersistenceTests(unittest.TestCase):
    setUp=test_server.WorkflowTests.setUp
    register=test_server.WorkflowTests.register
    call=test_server.WorkflowTests.call
    report=test_server.WorkflowTests.report
    def test_rejected_media_never_persisted_and_retry_can_succeed(self):
        raw=clip()
        with patch.object(v,'moderate_frames',side_effect=v.VideoError('Rejected',422)):
            with self.assertRaises(s.ApiError):self.report(photo=raw)
        self.assertEqual(self.call('GET','/issues')['total'],0)
        with patch.object(v,'moderate_frames'):
            issue=self.report(photo=raw)
        self.assertTrue(issue['photo'].startswith('data:video/mp4;'))
        with patch.object(v,'moderate_frames',side_effect=v.VideoError('Unavailable',503)):
            with self.assertRaises(s.ApiError):self.call('POST','/issues/'+issue['id']+'/resolve',{'photo':raw})
        self.assertIsNone(self.call('GET','/issues/'+issue['id'])['resolved'])
        with patch.object(v,'moderate_frames'):
            closed=self.call('POST','/issues/'+issue['id']+'/resolve',{'photo':raw})
        self.assertEqual(closed['status'],'resolved')
        self.assertTrue(closed['proofs'][0]['photo'].startswith('data:video/mp4;'))
