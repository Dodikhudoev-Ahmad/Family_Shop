using FluentValidation;
using Application.DTOs;
using Domain.Entities;

namespace Application.Validators;

public class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequestDto>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Items).NotEmpty().WithMessage("Cart is empty.");
        // Each line costs a database round trip: an unbounded list is a cheap way to tie the API up.
        RuleFor(x => x.Items).Must(items => items is null || items.Count <= MaxLines)
            .WithMessage($"An order can contain at most {MaxLines} lines.");
        RuleForEach(x => x.Items).SetValidator(new CreateOrderItemValidator());

        // Blank name falls back to the account name in OrderService.
        RuleFor(x => x.ContactName).MaximumLength(200);
        RuleFor(x => x.ContactPhone).NotEmpty().MaximumLength(32);
        RuleFor(x => x.DeliveryMethod).IsInEnum();

        RuleFor(x => x.Address).NotEmpty().When(x => x.DeliveryMethod == DeliveryMethod.Courier)
            .WithMessage("Address is required for courier delivery.");

        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.PromoCode).MaximumLength(50);
    }

    private const int MaxLines = 50;
}

public class CreateOrderItemValidator : AbstractValidator<CreateOrderItemDto>
{
    public CreateOrderItemValidator()
    {
        RuleFor(x => x.ProductId).GreaterThan(0);
        RuleFor(x => x.Quantity).GreaterThan(0).LessThanOrEqualTo(50);
        RuleFor(x => x.Size).MaximumLength(20);
    }
}

public class UpdateOrderStatusRequestValidator : AbstractValidator<UpdateOrderStatusRequestDto>
{
    public UpdateOrderStatusRequestValidator()
    {
        RuleFor(x => x.Status).IsInEnum();
    }
}
