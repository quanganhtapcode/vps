import requests
import time
import statistics

def test_speed(url, name, iterations=10):
    latencies = []
    print(f"Testing {name}...")
    for _ in range(iterations):
        start = time.perf_counter()
        try:
            r = requests.get(url, timeout=5)
            end = time.perf_counter()
            if r.status_code == 200:
                latencies.append((end - start) * 1000)
            else:
                print(f"  Error: {url} returned {r.status_code}")
        except Exception as e:
            print(f"  Error connecting to {url}: {e}")
        time.sleep(0.1)
    
    avg = statistics.mean(latencies)
    print(f"Average Latency: {avg:.2f}ms (Min: {min(latencies):.2f}ms, Max: {max(latencies):.2f}ms)")
    return avg

# 1. Test our new RAM-cached API (Updated by BSC WS)
new_api = "https://api.quanganh.org/v1/valuation/market/prices"
# 2. Simulate old way (VCI indices endpoint)
old_simulation = "https://api.quanganh.org/v1/valuation/market/vci-indices" # Still hits VCI logic

avg_new = test_speed(new_api, "New BSC-RAM Flow")
avg_old = test_speed(old_simulation, "Old VCI-Upstream Flow")

print("\n--- RESULT ---")
print(f"New flow is {avg_old/avg_new:.1f}x faster in terms of API response time.")
