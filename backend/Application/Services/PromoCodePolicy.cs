using Application.Common;
using Domain.Entities;

namespace Application.Services;

public record PromoCodeEvaluation(decimal DiscountAmount, decimal FinalTotal);

/// <summary>
/// Pure validation/calculation rules for applying a promo code to an order subtotal, shared
/// between the validate-preview endpoint (<see cref="PromoCodeService"/>) and order creation
/// (<see cref="OrderService"/>) so both paths agree on what makes a code usable.
/// </summary>
public static class PromoCodePolicy
{
    public static Result<PromoCodeEvaluation> Evaluate(PromoCode promoCode, decimal orderSubtotal, DateTime nowUtc)
    {
        if (!promoCode.IsActive)
        {
            return Result<PromoCodeEvaluation>.Failure("Промокод больше не действует.");
        }

        if (nowUtc < promoCode.ValidFrom || nowUtc > promoCode.ValidUntil)
        {
            return Result<PromoCodeEvaluation>.Failure("Промокод истёк.");
        }

        if (promoCode.MinOrderAmount.HasValue && orderSubtotal < promoCode.MinOrderAmount.Value)
        {
            return Result<PromoCodeEvaluation>.Failure(
                $"Минимальная сумма заказа для этого промокода — {promoCode.MinOrderAmount.Value:0} ₸.");
        }

        if (promoCode.UsageLimit.HasValue && promoCode.UsageCount >= promoCode.UsageLimit.Value)
        {
            return Result<PromoCodeEvaluation>.Failure("Промокод больше не действует (лимит использований исчерпан).");
        }

        var discount = promoCode.DiscountType == PromoCodeDiscountType.Percentage
            ? Math.Round(orderSubtotal * promoCode.DiscountValue / 100m, 2)
            : promoCode.DiscountValue;

        if (promoCode.DiscountType == PromoCodeDiscountType.Percentage && promoCode.MaxDiscountAmount.HasValue)
        {
            discount = Math.Min(discount, promoCode.MaxDiscountAmount.Value);
        }

        discount = Math.Min(discount, orderSubtotal);

        return Result<PromoCodeEvaluation>.Success(new PromoCodeEvaluation(discount, orderSubtotal - discount));
    }
}
