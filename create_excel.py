import csv
import json

# Read CSV created
with open('payroll_deductions_august_2026.csv', 'r') as f:
    reader = csv.reader(f)
    rows = list(reader)

print(f"Loaded {len(rows)} rows from CSV.")
