using FluentValidation;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Validators;

public class OrderFilterValidator : AbstractValidator<OrderFilterDto>
{
    public OrderFilterValidator()
    {
        RuleFor(x => x)
            .Must(x => !x.DateFrom.HasValue || !x.DateTo.HasValue || x.DateFrom <= x.DateTo)
            .WithMessage("DateFrom must be less than or equal to DateTo.");
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}
