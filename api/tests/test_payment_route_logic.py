import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
import unittest
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException

from app.models.payment_schema import PaymentCreate, PaymentUpdate
from app.routes import payment as payment_routes


class _DummyRequest:
    def __init__(self, property_ids):
        self.state = SimpleNamespace(property_ids=property_ids)


class _TenantCollection:
    def __init__(self, tenant_doc):
        self._tenant_doc = tenant_doc

    async def find_one(self, _query):
        return self._tenant_doc


class PaymentRouteLogicTests(unittest.TestCase):
    def test_create_payment_rejects_vacated_tenant(self):
        tenant_doc = {
            "_id": "000000000000000000000001",
            "propertyId": "prop-1",
            "autoGeneratePayments": False,
            "tenantStatus": "vacated",
        }

        original_get_collection = payment_routes.getCollection
        payment_routes.getCollection = lambda _name: _TenantCollection(tenant_doc)

        payload = PaymentCreate(
            tenantId="000000000000000000000001",
            propertyId="prop-1",
            bed="bed-1",
            amount="₹5000",
            status="due",
            dueDate=date(2026, 3, 12),
            method="Cash",
        )
        request = _DummyRequest(property_ids=["prop-1"])

        try:
            with self.assertRaises(HTTPException) as exc_info:
                asyncio.run(payment_routes.create_payment(request, payload))
        finally:
            payment_routes.getCollection = original_get_collection

        self.assertEqual(exc_info.exception.status_code, 400)
        self.assertIn("vacated", str(exc_info.exception.detail).lower())

    def test_update_payment_checks_access_before_mutation(self):
        get_mock = AsyncMock(return_value=SimpleNamespace(propertyId="prop-2"))
        update_mock = AsyncMock(return_value=SimpleNamespace(propertyId="prop-2"))

        original_get = payment_routes.payment_service.get_payment_by_id
        original_update = payment_routes.payment_service.update_payment
        payment_routes.payment_service.get_payment_by_id = get_mock
        payment_routes.payment_service.update_payment = update_mock

        request = _DummyRequest(property_ids=["prop-1"])
        payload = PaymentUpdate(status="paid")

        try:
            with self.assertRaises(HTTPException) as exc_info:
                asyncio.run(payment_routes.update_payment(request, "pay-1", payload))
        finally:
            payment_routes.payment_service.get_payment_by_id = original_get
            payment_routes.payment_service.update_payment = original_update

        self.assertEqual(exc_info.exception.status_code, 404)
        update_mock.assert_not_awaited()

    def test_payment_stats_passes_request_scope(self):
        stats_mock = AsyncMock(return_value={"collected": "₹0", "pending": "₹0"})

        original_get_stats = payment_routes.payment_service.get_payment_stats
        payment_routes.payment_service.get_payment_stats = stats_mock

        request = _DummyRequest(property_ids=["prop-1", "prop-2"])

        try:
            result = asyncio.run(payment_routes.payment_stats(request))
        finally:
            payment_routes.payment_service.get_payment_stats = original_get_stats

        self.assertEqual(result, {"collected": "₹0", "pending": "₹0"})
        stats_mock.assert_awaited_once_with(property_ids=["prop-1", "prop-2"])

    def test_list_payments_returns_empty_for_no_scope(self):
        request = _DummyRequest(property_ids=[])

        result = asyncio.run(
            payment_routes.list_payments(
                request,
                page=3,
                page_size=25,
            )
        )

        self.assertEqual(result["data"], [])
        self.assertEqual(result["meta"]["total"], 0)
        self.assertEqual(result["meta"]["page"], 3)
        self.assertEqual(result["meta"]["pageSize"], 25)
        self.assertIs(result["meta"]["hasMore"], False)
