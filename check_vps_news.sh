#!/bin/bash
curl -s 'http://127.0.0.1:8000/api/news/FMC' | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]; print('img:', d.get('image_url')); print('date:', d.get('publish_date'))"
