import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export function tokenFor(email: string, purpose: 'verify' | 'reset' | 'change_email') {
  // Fixture exclusiva de la base efímera: no hay un endpoint de prueba ni un bypass en la aplicación.
  return execFileSync(resolve('../backend/.venv/bin/python'), ['-c', `
import os,sys
from sqlalchemy import create_engine,select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.modules.auth.models import User, AuthAction
from app.modules.auth.actions import raw_token
url=make_url(os.environ['DATABASE_URL'])
assert os.environ.get('APP_ENV') == 'test' and url.host in ('localhost','127.0.0.1') and url.database.endswith('_test')
with Session(create_engine(url)) as db:
    user=db.scalar(select(User).where(User.email_normalized==sys.argv[1]))
    action=db.scalar(select(AuthAction).where(AuthAction.user_id==user.id,AuthAction.purpose==sys.argv[2]).order_by(AuthAction.created_at.desc()))
    print(raw_token(action))
`, email, purpose], { cwd: resolve('../backend'), encoding: 'utf8' }).trim()
}
