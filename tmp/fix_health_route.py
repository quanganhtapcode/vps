f = '/var/www/valuation/backend/routes/health_routes.py'
lines = open(f).readlines()

# Remove any broken lines added at end (blank lines + broken add_url_rule + comment)
while lines:
    stripped = lines[-1].strip()
    if stripped == '' or stripped.startswith('# Also register') or 'add_url_rule' in stripped:
        lines.pop()
    else:
        break

# Add two correct lines
lines.append('\n# Also register at /api/health so nginx /v1/valuation/health works\n')
lines.append('health_bp.add_url_rule("/api/health", endpoint="api_health", view_func=health)\n')

open(f, 'w').write(''.join(lines))
print('Fixed. Last 4 lines:')
print(''.join(lines[-4:]))

# Verify syntax
import ast
src = open(f).read()
try:
    ast.parse(src)
    print('SYNTAX OK')
except SyntaxError as e:
    print('SYNTAX ERROR:', e)
