using FluentValidation;
using Application.DTOs;

namespace Application.Validators;

public class PromoCodeFilterValidator : AbstractValidator<PromoCodeFilterDto>
{
    public PromoCodeFilterValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}
