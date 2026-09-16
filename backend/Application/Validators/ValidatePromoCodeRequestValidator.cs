using FluentValidation;
using Application.DTOs;

namespace Application.Validators;

public class ValidatePromoCodeRequestValidator : AbstractValidator<ValidatePromoCodeRequestDto>
{
    public ValidatePromoCodeRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50);
        RuleFor(x => x.OrderSubtotal).GreaterThanOrEqualTo(0);
    }
}
