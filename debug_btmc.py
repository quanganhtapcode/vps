import requests
import xml.etree.ElementTree as ET

url = "http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/xml'
}
response = requests.get(url, headers=headers)
root = ET.fromstring(response.content)

for data_elem in root.findall('Data'):
    row = data_elem.get('row')
    if not row: continue
    name = data_elem.get(f'n_{row}', '')
    karat = data_elem.get(f'k_{row}', '')
    buy = data_elem.get(f'pb_{row}', '0')
    sell = data_elem.get(f'ps_{row}', '0')
    print(f"Name: {name}, Karat: {karat}, Buy: {buy}, Sell: {sell}")
