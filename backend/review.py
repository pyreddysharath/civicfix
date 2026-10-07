"""Trusted server operator review tool. Never expose this command through the public API."""
import argparse,json
import server as s
p=argparse.ArgumentParser(description='List pending proof or record an operator decision with an audit note.')
p.add_argument('action',choices=['list','accept','reject']);p.add_argument('--proof');p.add_argument('--operator');p.add_argument('--reason')
a=p.parse_args()
with s.database() as db:
    if a.action=='list':
        for r in db.execute('SELECT p.id,p.issue_id,p.result,i.title FROM proofs p JOIN issues i ON p.issue_id=i.id WHERE i.resolved IS NULL AND p.accepted=0 ORDER BY p.created'):
            if json.loads(r['result']).get('decision')=='review':print(json.dumps(dict(r)))
    else:
        if not a.proof or not a.operator or not a.reason:p.error('--proof, --operator and --reason are required')
        db.execute('BEGIN IMMEDIATE')
        r=db.execute('SELECT p.*, i.resolved FROM proofs p JOIN issues i ON p.issue_id=i.id WHERE p.id=?',(a.proof,)).fetchone()
        if not r:p.error('Proof not found')
        if r['resolved'] is not None:p.error('Issue already resolved')
        accepted=a.action=='accept';t=s.now()
        result={'decision':'accepted' if accepted else 'rejected','reason':a.reason,'method':'Operator review','operator':a.operator}
        db.execute('UPDATE proofs SET result=?,accepted=? WHERE id=?',(json.dumps(result),int(accepted),a.proof))
        if accepted:db.execute('UPDATE issues SET resolved=? WHERE id=?',(t,r['issue_id']))
        db.execute('INSERT INTO events(issue_id,created,actor,action,note) VALUES(?,?,?,?,?)',(r['issue_id'],t,'operator:'+a.operator,'review_accepted' if accepted else 'review_rejected',a.reason))
        print('Decision saved with audit event.')
