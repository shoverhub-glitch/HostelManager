import unittest
import sys
from pathlib import Path
from datetime import date

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.tenant_service import TenantService
from app.models.tenant_schema import BillingStatus


class TenantBillingLogicTests(unittest.TestCase):
    def test_due_status_uses_upcoming_anchor_day(self):
        today = date(2026, 3, 12)
        due_date = TenantService._calculate_initial_due_date(
            anchor_day=13,
            billing_status=BillingStatus.DUE.value,
            today=today,
        )
        self.assertEqual(due_date, date(2026, 3, 13))

    def test_due_status_rolls_to_next_month_if_anchor_passed(self):
        today = date(2026, 3, 20)
        due_date = TenantService._calculate_initial_due_date(
            anchor_day=13,
            billing_status=BillingStatus.DUE.value,
            today=today,
        )
        self.assertEqual(due_date, date(2026, 4, 13))

    def test_paid_status_uses_previous_cycle_when_anchor_is_future(self):
        today = date(2026, 3, 12)
        due_date = TenantService._calculate_initial_due_date(
            anchor_day=13,
            billing_status=BillingStatus.PAID.value,
            today=today,
        )
        self.assertEqual(due_date, date(2026, 2, 13))

    def test_paid_status_uses_current_month_when_anchor_reached(self):
        today = date(2026, 3, 20)
        due_date = TenantService._calculate_initial_due_date(
            anchor_day=13,
            billing_status=BillingStatus.PAID.value,
            today=today,
        )
        self.assertEqual(due_date, date(2026, 3, 13))


if __name__ == '__main__':
    unittest.main()
