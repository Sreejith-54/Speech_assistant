"""Test script to check registered routes in api_deaf.py"""
import sys
sys.path.insert(0, ".")

from backend.routes.api_deaf import router

print("=" * 60)
print("Registered routes in deaf_router:")
print("=" * 60)

for route in router.routes:
    print(f"Path: {route.path:40} Methods: {route.methods if hasattr(route, 'methods') else 'N/A'}")

print("=" * 60)
print(f"Total routes: {len(router.routes)}")
