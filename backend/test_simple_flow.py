"""Verification, authorization, deadline and filtering regression tests."""
import hashlib
import unittest
from unittest.mock import patch
import test_server as base
s=base.s
photo=base.photo

class SimpleFlowTests(base.WorkflowTests):
    def send(self,email='new@example.com'):
        with patch.object(s,'send_email_otp') as mail:
            self.call('POST','/auth/send-otp',{'email':email})
        return mail.call_args.args[1]
    def verify(self,code,email='new@example.com'):
        return self.call('POST','/auth/verify-otp',{'email':email,'code':code})['verification_token']
    def test_unverified_registration_is_rejected(self):
        with self.assertRaises(s.ApiError):self.call('POST','/auth/register',dict(email='new@example.com',name='New',password='long-password-123',verification_token='fake'))
    def test_otp_is_not_returned_and_registration_consumes_token(self):
        code=self.send();token=self.verify(code)
        body=dict(email='new@example.com',name='New',password='long-password-123',verification_token=token)
        account=self.call('POST','/auth/register',body);self.assertEqual(account['user']['name'],'New')
        with self.assertRaises(s.ApiError):self.call('POST','/auth/register',body)
    def test_code_expires(self):
        code=self.send()
        with patch.object(s,'now',return_value=s.now()+601):
            with self.assertRaises(s.ApiError):self.verify(code)
    def test_five_wrong_attempts_are_persisted(self):
        code=self.send();wrong='000000' if code!='000000' else '111111'
        for _ in range(5):
            with self.assertRaises(s.ApiError):self.verify(wrong)
        with self.assertRaises(s.ApiError):self.verify(code)
        with s.database() as db:self.assertEqual(db.execute('SELECT attempts FROM email_verifications WHERE email=?',('new@example.com',)).fetchone()[0],5)
    def test_verification_is_bound_to_email_and_code_is_one_use(self):
        code=self.send();token=self.verify(code)
        with self.assertRaises(s.ApiError):self.verify(code)
        with self.assertRaises(s.ApiError):self.call('POST','/auth/register',dict(email='someone@example.com',name='New',password='long-password-123',verification_token=token))
    def test_resend_cooldown_and_old_code_invalidated(self):
        old=self.send()
        with self.assertRaises(s.ApiError):self.send()
        t=s.now()
        with patch.object(s,'now',return_value=t+61),patch.object(s.secrets,'randbelow',return_value=123456 if old!='123456' else 654321):
            new=self.send()
            with self.assertRaises(s.ApiError):self.verify(old)
            self.assertTrue(self.verify(new))
    def test_smtp_failure_is_not_success(self):
        with patch.object(s,'send_email_otp',side_effect=s.ApiError('Mail unavailable',503)):
            with self.assertRaises(s.ApiError):self.call('POST','/auth/send-otp',{'email':'new@example.com'})
        with s.database() as db:self.assertIsNone(db.execute('SELECT * FROM email_verifications WHERE email=?',('new@example.com',)).fetchone())
    def test_smtp_missing_configuration(self):
        with patch.dict(s.os.environ,{},clear=True):
            with self.assertRaises(s.ApiError) as cm:s.send_email_otp('new@example.com','123456')
        self.assertEqual(cm.exception.status,503)
    def test_optional_description_and_exact_seven_day_eta(self):
        r=self.report(description='');self.assertEqual(r['description'],'');self.assertEqual(r['deadline']-r['created'],7*86400)
        for days in [0,6,6.99,7.1,367,float('nan')]:
            with self.assertRaises(s.ApiError):self.report(request_id=str(days),eta_days=days)
    def test_manual_resolution_without_photo(self):
        r=self.report();closed=self.call('POST','/issues/'+r['id']+'/resolve')
        self.assertEqual(closed['status'],'resolved');self.assertEqual(closed['proofs'],[])
        again=self.call('POST','/issues/'+r['id']+'/resolve');self.assertEqual(again['resolved'],closed['resolved']);self.assertEqual(len(again['events']),2)
    def test_manual_resolution_with_photo_and_ownership(self):
        r=self.report()
        with self.assertRaises(s.ApiError) as cm:self.call('POST','/issues/'+r['id']+'/resolve',token=self.other['token'])
        self.assertEqual(cm.exception.status,403)
        r=self.call('POST','/issues/'+r['id']+'/resolve',{'photo':photo('green')});self.assertEqual(len(r['proofs']),1);self.assertTrue(r['proofs'][0]['photo'])
    def test_invalid_optional_photo_does_not_resolve(self):
        r=self.report()
        with self.assertRaises(s.ApiError):self.call('POST','/issues/'+r['id']+'/resolve',{'photo':'bad'})
        self.assertIsNone(self.call('GET','/issues/'+r['id'])['resolved'])
    def test_filters_and_deadline_equality(self):
        r=self.report()
        for field,value in [('country','India'),('city','Hyderabad'),('street','Main Street'),('reporter_id',self.owner['user']['id'])]:
            self.assertEqual(self.call('GET','/issues',query={field:value})['total'],1)
            self.assertEqual(self.call('GET','/issues',query={field:'other'})['total'],0)
        with patch.object(s,'now',return_value=r['deadline']):
            self.assertEqual(self.call('GET','/issues',query={'status':'open'})['total'],0)
            self.assertEqual(self.call('GET','/issues',query={'status':'overdue'})['total'],1)
            r=self.call('POST','/issues/'+r['id']+'/resolve');self.assertEqual(r['status'],'resolved')
    def test_reporter_email_is_not_in_issue_responses(self):
        r=self.report();self.assertNotIn('username',r);self.assertEqual(r['reporter'],'Sharath')

if __name__=='__main__':unittest.main(verbosity=2)
