using FluentValidation;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Validators;

public class CategoryUpsertValidator : AbstractValidator<CategoryUpsertDto>
{
    public CategoryUpsertValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Slug).NotEmpty().MaximumLength(100)
            .Matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")
            .WithMessage("Адрес (slug) может содержать только латинские буквы, цифры и дефисы.");
        RuleFor(x => x.ParentCategoryId).GreaterThan(0).When(x => x.ParentCategoryId.HasValue);
    }
}
