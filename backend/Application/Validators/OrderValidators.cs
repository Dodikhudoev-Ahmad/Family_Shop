using FluentValidation;
using Application.DTOs;
using Domain.Entities;

namespace Application.Validators;

public class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequestDto>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Items).NotEmpty().WithMessage("Cart is empty.");
        RuleForEach(x => x.Items).SetValidator(new CreateOrderItemValidator());

        // Blank name falls back to the account name in OrderService.
        RuleFor(x => x.ContactName).MaximumLength(200);
        RuleFor(x => x.ContactPhone).NotEmpty().MaximumLength(32);
        RuleFor(x => x.DeliveryMethod).IsInEnum();

        RuleFor(x => x.Address).NotEmpty().When(x => x.DeliveryMethod == DeliveryMethod.Courier)
            .WithMessage("Address is required for courier delivery.");

        RuleFor(x => x.PromoCode).MaximumLength(50);
    }
}

public class CreateOrderItemValidator : AbstractValidator<CreateOrderItemDto>
{
    public CreateOrderItemValidator()
    {
        RuleFor(x => x.ProductId).GreaterThan(0);
        RuleFor(x => x.Quantity).GreaterThan(0).LessThanOrEqualTo(50);
    }
}

public class UpdateOrderStatusRequestValidator : AbstractValidator<UpdateOrderStatusRequestDto>
{
    public UpdateOrderStatusRequestValidator()
    {
        RuleFor(x => x.Status).IsInEnum();
    }
}
