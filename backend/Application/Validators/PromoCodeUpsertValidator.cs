using FluentValidation;
using Application.DTOs;
using Domain.Entities;

namespace Application.Validators;

public class PromoCodeUpsertValidator : AbstractValidator<PromoCodeUpsertDto>
{
    public PromoCodeUpsertValidator()
    {
        // The service uppercases the code before saving (PromoCodeService.CreatePromoCodeAsync),
        // so validation must accept lowercase input too - otherwise a lowercase code sent
        // directly to the API (not through the admin form, which already uppercases on input)
        // is rejected even though the service would have normalized it just fine.
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50)
            .Matches("^[A-Za-z0-9]+$")
            .WithMessage("Промокод может содержать только латинские буквы и цифры.");

        RuleFor(x => x.DiscountType).IsInEnum();

        RuleFor(x => x.DiscountValue).GreaterThan(0);
        RuleFor(x => x.DiscountValue).LessThanOrEqualTo(100)
            .When(x => x.DiscountType == PromoCodeDiscountType.Percentage)
            .WithMessage("Скидка в процентах не может превышать 100.");

        RuleFor(x => x.MinOrderAmount).GreaterThanOrEqualTo(0).When(x => x.MinOrderAmount.HasValue);
        RuleFor(x => x.MaxDiscountAmount).GreaterThan(0).When(x => x.MaxDiscountAmount.HasValue);
        RuleFor(x => x.MaxDiscountAmount)
            .Null()
            .When(x => x.DiscountType == PromoCodeDiscountType.FixedAmount)
            .WithMessage("Максимальная скидка применяется только к промокодам в процентах.");

        RuleFor(x => x.UsageLimit).GreaterThan(0).When(x => x.UsageLimit.HasValue);

        RuleFor(x => x.ValidUntil).GreaterThan(x => x.ValidFrom)
            .WithMessage("Дата окончания действия должна быть позже даты начала.");
    }
}
