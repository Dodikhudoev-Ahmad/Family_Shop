using Application.Common;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

/// <summary>
/// What an order status change does to the money ledger (docs/Money.md, "Финансы"). Called inside the transaction of the
/// compare-and-set that performed the change, so only the request that really moved the order writes payments, and both
/// writes are idempotent in the database as well (unique index OrderId + Type).
/// </summary>
public static class OrderLedger
{
    public static async Task RecordTransitionAsync(
        IPaymentRepository payments, int orderId, decimal orderTotal, OrderStatus from, OrderStatus to, DateTime at,
        CancellationToken cancellationToken = default)
    {
        if (to == OrderStatus.Delivered)
        {
            // Cash on delivery: the money arrives now. An order that rounds to 0 tenge (a 100% promo) brought none.
            var amount = FinanceMoney.WholeTenge(orderTotal);
            if (amount > 0)
            {
                await payments.TryAddIncomeAsync(orderId, amount, at, cancellationToken);
            }
        }
        else if (to == OrderStatus.Cancelled && from == OrderStatus.Delivered)
        {
            // A completed order taken back: the storno is the income's own amount, once. (Delivered -> Cancelled is not an
            // allowed transition today, so the workflow never reaches this; the guard is here for when it is allowed.)
            await payments.TryAddReversalAsync(orderId, at, cancellationToken);
        }
        // Cancelled from Created / Processing / Shipped: no money ever moved, nothing to record.
    }
}
