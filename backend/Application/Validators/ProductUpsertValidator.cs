using FluentValidation;
using Application.DTOs;

namespace Application.Validators;

public class ProductUpsertValidator : AbstractValidator<ProductUpsertDto>
{
    public ProductUpsertValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(4000);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.DiscountPrice).GreaterThan(0).LessThan(x => x.Price)
            .When(x => x.DiscountPrice.HasValue)
            .WithMessage("Цена со скидкой должна быть больше нуля и меньше обычной цены.");
        RuleFor(x => x.Stock).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.Images).NotEmpty().WithMessage("Добавьте хотя бы одно изображение.");
        RuleForEach(x => x.Images).NotEmpty().MaximumLength(2000);
    }
}
