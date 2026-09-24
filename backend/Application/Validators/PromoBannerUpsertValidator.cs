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
        // Only a relative in-app path or an http(s) URL is allowed - blocks "javascript:"/"data:"
        // etc. from ever being stored, since the frontend renders this straight into an <a href>.
        RuleFor(x => x.ButtonLink)
            .Must(link => string.IsNullOrEmpty(link) || link.StartsWith('/') || link.StartsWith("http://") || link.StartsWith("https://"))
            .WithMessage("Button link must be a relative path or an http(s) URL.");
        RuleFor(x => x.ImageUrl).MaximumLength(1000);
        RuleFor(x => x.SortOrder).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Placement).IsInEnum();
    }
}
