using FluentValidation;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Validators;

public class CreateReviewRequestValidator : AbstractValidator<CreateReviewRequestDto>
{
    public CreateReviewRequestValidator()
    {
        RuleFor(x => x.Rating).InclusiveBetween(1, 5);
        RuleFor(x => x.Comment).NotEmpty().MaximumLength(2000);
    }
}
