using FluentValidation;
using Application.DTOs;
using Domain.Entities;

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
        RuleFor(x => x.ProductType).MaximumLength(50)
            .Must(t => string.IsNullOrWhiteSpace(t) || ProductTypeClassifier.KnownTypes.Contains(t!.Trim()))
            .WithMessage("Неизвестный тип товара.");
        // Structure only; whether the sizes belong to the grid of this product's type depends on its category and
        // type and is checked by ProductService (ProductSizeRules).
        RuleFor(x => x.AvailableSizes).Must(s => s is null || s.Count <= 30).WithMessage("Слишком много размеров.");
        RuleForEach(x => x.AvailableSizes).NotEmpty().MaximumLength(16);
        RuleFor(x => x.AvailableSizes)
            .Must(s => s is null || s.Distinct(StringComparer.Ordinal).Count() == s.Count)
            .WithMessage("Размеры не должны повторяться.");
        RuleFor(x => x.Images).NotEmpty().WithMessage("Добавьте хотя бы одно изображение.");
        RuleFor(x => x.Images).Must(images => images is null || images.Count <= 10).WithMessage("At most 10 images per product.");
        RuleForEach(x => x.Images).NotEmpty().MaximumLength(2000)
            .Must(UrlRules.IsSafeImage).WithMessage("Image must be an http(s) URL or an in-app path.");
    }
}
