import unittest
import test_server

class MetadataSearchTests(unittest.TestCase):
    setUp=test_server.WorkflowTests.setUp
    register=test_server.WorkflowTests.register
    call=test_server.WorkflowTests.call
    report=test_server.WorkflowTests.report

    def test_keywords_across_fields_and_any_order(self):
        self.report()
        for query in ['india pothole sharath','SHARATH,india,road','road road']:
            self.assertEqual(self.call('GET','/issues',query={'q':query})['total'],1)
        self.assertEqual(self.call('GET','/issues',query={'q':'india unknown'})['total'],0)
        self.assertEqual(self.call('GET','/issues',query={'category':'potholes roads','street':'street main'})['total'],1)
        self.assertEqual(self.call('GET','/issues',query={'q':'%'})['total'],0)

    def test_metadata_persistence_and_original_proof_separation(self):
        data={'name':'road.jpg','width':1200,'camera_model':'Camera','unexpected':'discard'}
        issue=self.report(media_metadata=data)
        self.assertEqual(issue['media_metadata']['name'],'road.jpg')
        self.assertNotIn('unexpected',issue['media_metadata'])
        closed=self.call('POST','/issues/'+issue['id']+'/resolve',{'photo':test_server.photo('gray'),'media_metadata':{'name':'repair.jpg'}})
        self.assertEqual(closed['media_metadata']['name'],'road.jpg')
        self.assertEqual(closed['proofs'][0]['media_metadata']['name'],'repair.jpg')
        fetched=self.call('GET','/issues/'+issue['id'])
        self.assertEqual(fetched['proofs'][0]['media_metadata']['name'],'repair.jpg')

    def test_worldwide_count_ignores_location_filters(self):
        self.assertEqual(self.call('GET','/issues/count')['total'],0)
        self.report()
        self.assertEqual(self.call('GET','/issues/count',query={'lat':'0','lon':'0','radius':'3'})['total'],1)
