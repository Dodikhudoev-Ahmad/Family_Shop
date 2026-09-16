using FluentValidation;
using Application.DTOs;

namespace Application.Validators;

public class PromoBannerUpsertValidator : AbstractValidator<PromoBannerUpsertDto>
{
    public PromoBannerUpsertValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Subtitle).MaximumLength(500);
        RuleFor(x => x.ButtonText).MaximumLength(100);
        RuleFor(x => x.ButtonLink).MaximumLength(500);
        RuleFor(x => x.ImageUrl).MaximumLength(1000);
        RuleFor(x => x.SortOrder).GreaterThanOrEqualTo(0);
    }
}
