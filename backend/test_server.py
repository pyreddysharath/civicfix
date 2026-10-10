import base64, io, json, os, tempfile, unittest
from unittest.mock import patch
from PIL import Image
TMP=tempfile.TemporaryDirectory()
os.environ['CIVICFIX_DB']=os.path.join(TMP.name,'test.sqlite3')
os.environ.pop('OPENAI_API_KEY',None)
import server as s

def photo(color):
    out=io.BytesIO();Image.new('RGB',(320,240),color).save(out,'JPEG');return s.data_url(out.getvalue())
class WorkflowTests(unittest.TestCase):
    def setUp(self):
        with s.database() as db:
            for table in ['events','proofs','issues','sessions','users','limits','email_verifications']: db.execute('DELETE FROM '+table)
        self.owner=self.register('reporter@example.com','Sharath','long-password-123')
        self.other=self.register('helper@example.com','Neighbour','helper-password-123')
        self.token=self.owner['token']
    def register(self,email,name,password):
        with patch.object(s,'send_email_otp') as mail:
            s.dispatch('POST','/auth/send-otp',{},dict(email=email),'','127.0.0.1')
            code=mail.call_args.args[1]
        verified=s.dispatch('POST','/auth/verify-otp',{},dict(email=email,code=code),'','127.0.0.1')
        return s.dispatch('POST','/auth/register',{},dict(email=email,name=name,password=password,verification_token=verified['verification_token']),'','127.0.0.1')
    def call(self,method,path,body=None,query=None,token=None):return s.dispatch(method,path,query or {},body or {},self.token if token is None else token,'127.0.0.1')
    def report(self,**overrides):
        data=dict(request_id='test-1',title='Broken road',description='A deep pothole blocks this road.',category='Road',street='Main Street',city='Hyderabad',state='Telangana',country='India',lat=17.4,lon=78.3,accuracy=10,captured=s.now()-10,eta_days=7,photo=photo('gray'))
        data.update(overrides);return self.call('POST','/issues',data)
    def proof(self,**overrides):
        data=dict(photo=photo('green'),lat=17.4,lon=78.3,accuracy=10,captured=s.now(),note='Road resurfaced')
        data.update(overrides);return data
    def test_register_and_login(self):
        r=self.call('POST','/auth/login',dict(email='reporter@example.com',password='long-password-123'));self.assertEqual(r['user']['name'],'Sharath')
        self.assertNotEqual(r['token'],self.token)
    def test_wrong_password_and_missing_auth(self):
        with self.assertRaises(s.ApiError):self.call('POST','/auth/login',dict(email='reporter@example.com',password='bad'))
        with self.assertRaises(s.ApiError):self.call('GET','/issues',token='')
    def test_photo_persistence_and_no_ai_fabrication(self):
        r=self.report();self.assertEqual(r['status'],'open');self.assertTrue(r['photo'].startswith('data:image/jpeg;base64,'));self.assertEqual(r['analysis'],{})
        self.assertEqual(self.call('GET','/issues/'+r['id'])['photo'],r['photo'])
    def test_retry_is_idempotent(self):
        a=self.report();b=self.report();self.assertEqual(a['id'],b['id']);self.assertEqual(self.call('GET','/issues')['total'],1)
    def test_search_place_person_and_literal_wildcard(self):
        self.report()
        for q in ['Hyderabad','telangana','India','main street','Sharath','reporter']:
            self.assertEqual(self.call('GET','/issues',query={'q':q})['total'],1)
        self.assertEqual(self.call('GET','/issues',query={'q':'%'})['total'],0)
    def test_nearby_radius(self):
        self.report();q={'lat':'17.4','lon':'78.3','radius':'5'};self.assertEqual(self.call('GET','/issues',query=q)['total'],1)
        q['lat']='20';self.assertEqual(self.call('GET','/issues',query=q)['total'],0)
    def test_my_issues_and_area_totals(self):
        self.report();d=self.call('GET','/issues');self.assertEqual(d['areas'][0]['open'],1)
        self.assertEqual(self.call('GET','/issues',query={'mine':'1'},token=self.other['token'])['total'],0)
    def test_due_boundary(self):
        r=self.report()
        with patch.object(s,'now',return_value=r['deadline']):self.assertEqual(self.call('GET','/issues/'+r['id'])['status'],'overdue')
    def test_pending_proof_does_not_close(self):
        r=self.report();r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof(),token=self.other['token'])
        self.assertIsNone(r['resolved']);self.assertEqual(r['proofs'][0]['result']['decision'],'review');self.assertEqual(r['proofs'][0]['contributor'],'Neighbour')
        self.assertEqual(self.call('GET','/issues',query={'q':'Neighbour'})['total'],1)
    def test_matching_confident_proof_closes(self):
        r=self.report()
        with patch.object(s,'vision',return_value=dict(same_scene=True,fixed=True,clear=True,confidence=.98,reason='Same road is visibly repaired.')):
            r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof(),token=self.other['token'])
        self.assertEqual(r['status'],'resolved');self.assertTrue(r['on_time']);self.assertEqual(r['proofs'][0]['accepted'],1)
    def test_low_confidence_and_string_boolean_never_close(self):
        for result in [dict(same_scene=True,fixed=True,clear=True,confidence=.7),dict(same_scene='true',fixed=True,clear=True,confidence=.99)]:
            r=self.report()
            with patch.object(s,'vision',return_value=result):
                r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof())
            self.assertIsNone(r['resolved'])
    def test_reused_image_and_distant_gps(self):
        r=self.report();r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof(photo=photo('gray')));self.assertEqual(r['proofs'][0]['result']['decision'],'rejected')
        r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof(lat=20));self.assertIsNone(r['resolved']);self.assertIn('100 metres',r['proofs'][0]['result']['reason'])
    def test_late_resolution_green_status_red_time(self):
        r=self.report()
        with s.database() as db:db.execute('UPDATE issues SET deadline=? WHERE id=?',(s.now()-1,r['id']))
        with patch.object(s,'vision',return_value=dict(same_scene=True,fixed=True,clear=True,confidence=.99,reason='Fixed')):
            r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof())
        self.assertEqual(r['status'],'resolved');self.assertFalse(r['on_time'])
    def test_reopen_ownership_and_audit(self):
        r=self.report()
        with patch.object(s,'vision',return_value=dict(same_scene=True,fixed=True,clear=True,confidence=1,reason='Fixed')):r=self.call('POST','/issues/'+r['id']+'/proofs',self.proof())
        with self.assertRaises(s.ApiError):self.call('POST','/issues/'+r['id']+'/reopen',{'reason':'Still broken'},token=self.other['token'])
        r=self.call('POST','/issues/'+r['id']+'/reopen',{'reason':'Still broken'});self.assertIsNone(r['resolved']);self.assertEqual(r['events'][0]['action'],'reopened')
    def test_invalid_image_deadline_coordinates(self):
        for values in [{'photo':'invalid'},{'eta_days':6},{'lat':999},{'lon':float('nan')}]:
            with self.assertRaises(s.ApiError):self.report(**values)
    def test_expired_session(self):
        with s.database() as db:db.execute('UPDATE sessions SET expires=0')
        with self.assertRaises(s.ApiError):self.call('GET','/me')
    def test_pagination(self):
        self.report(request_id='one');self.report(request_id='two');r=self.call('GET','/issues',query={'limit':1});self.assertEqual(r['total'],2);self.assertEqual(r['next_offset'],1)
        r2=self.call('GET','/issues',query={'limit':1,'offset':1});self.assertNotEqual(r['items'][0]['id'],r2['items'][0]['id']);self.assertIsNone(r2['next_offset'])
    def test_wsgi_rejects_bad_json(self):
        statuses=[];response=s.application({'REQUEST_METHOD':'POST','PATH_INFO':'/auth/login','CONTENT_LENGTH':'1','wsgi.input':io.BytesIO(b'{')},lambda code,headers:statuses.append(code))
        self.assertTrue(statuses[0].startswith('400'));self.assertIn('Invalid JSON',response[0].decode())
if __name__=='__main__':unittest.main(verbosity=2)
