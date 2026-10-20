import io,json,unittest
from unittest.mock import patch
import server as s
class ModerationTests(unittest.TestCase):
    def test_missing_key_blocks(self):
        with patch.dict(s.os.environ,{},clear=True),self.assertRaises(s.ApiError):s.moderate_photo(b'photo')
    def test_result_contract(self):
        for result,allowed in [({'results':[{'flagged':False}]},True),({'results':[{'flagged':True}]},False),({'results':[{'flagged':'false'}]},False),({'results':[]},False),({},False)]:
            with self.subTest(result=result),patch.dict(s.os.environ,{'OPENAI_API_KEY':'test-only'}),patch.object(s.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
                if allowed:s.moderate_photo(b'photo')
                else:
                    with self.assertRaises(s.ApiError):s.moderate_photo(b'photo')
    def test_timeout_blocks(self):
        with patch.dict(s.os.environ,{'OPENAI_API_KEY':'test-only'}),patch.object(s.urllib.request,'urlopen',side_effect=TimeoutError()),self.assertRaises(s.ApiError):s.moderate_photo(b'photo')
