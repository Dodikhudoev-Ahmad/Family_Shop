using FluentValidation;
using Application.DTOs;
using Application.Services;

namespace Application.Validators;

public static class FinanceRangeRules
{
    /// <summary>Longest range of shop days a query may span (inclusive of both ends).</summary>
    public const int MaxDays = 366;

    public static bool IsOrdered(DateTime from, DateTime to) => from.Date <= to.Date;

    public static bool IsWithinLimit(DateTime from, DateTime to) => (to.Date - from.Date).TotalDays < MaxDays;
}

public class FinanceSummaryQueryValidator : AbstractValidator<FinanceSummaryQueryDto>
{
    public FinanceSummaryQueryValidator()
    {
        RuleFor(x => x.Period).IsInEnum();
        When(x => x.Period == FinancePeriod.Custom, () =>
        {
            RuleFor(x => x.DateFrom).NotNull().WithMessage("Для произвольного периода укажите dateFrom.");
            RuleFor(x => x.DateTo).NotNull().WithMessage("Для произвольного периода укажите dateTo.");
            When(x => x.DateFrom.HasValue && x.DateTo.HasValue, () =>
            {
                RuleFor(x => x)
                    .Must(x => FinanceRangeRules.IsOrdered(x.DateFrom!.Value, x.DateTo!.Value))
                    .WithMessage("DateFrom must be less than or equal to DateTo.")
                    .Must(x => FinanceRangeRules.IsWithinLimit(x.DateFrom!.Value, x.DateTo!.Value))
                    .WithMessage($"Период не должен быть длиннее {FinanceRangeRules.MaxDays} дней.");
            });
        });
    }
}

public class FinanceRangeValidator : AbstractValidator<FinanceRangeDto>
{
    public FinanceRangeValidator()
    {
        RuleFor(x => x)
            .Must(x => x.DateFrom.HasValue == x.DateTo.HasValue)
            .WithMessage("Укажите обе даты (dateFrom и dateTo) или ни одной.");
        When(x => x.DateFrom.HasValue && x.DateTo.HasValue, () =>
        {
            RuleFor(x => x)
                .Must(x => FinanceRangeRules.IsOrdered(x.DateFrom!.Value, x.DateTo!.Value))
                .WithMessage("DateFrom must be less than or equal to DateTo.")
                .Must(x => FinanceRangeRules.IsWithinLimit(x.DateFrom!.Value, x.DateTo!.Value))
                .WithMessage($"Период не должен быть длиннее {FinanceRangeRules.MaxDays} дней.");
        });
    }
}

public class FinanceJournalFilterValidator : AbstractValidator<FinanceJournalFilterDto>
{
    public FinanceJournalFilterValidator()
    {
        RuleFor(x => x.Kind).IsInEnum();
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x)
            .Must(x => !x.DateFrom.HasValue || !x.DateTo.HasValue || FinanceRangeRules.IsOrdered(x.DateFrom.Value, x.DateTo.Value))
            .WithMessage("DateFrom must be less than or equal to DateTo.");
    }
}

public class CreateExpenseRequestValidator : AbstractValidator<CreateExpenseRequestDto>
{
    public CreateExpenseRequestValidator()
    {
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Amount)
            .GreaterThan(0).WithMessage("Сумма должна быть больше нуля.")
            .LessThanOrEqualTo(FinanceService.MaxExpense).WithMessage("Сумма слишком большая.")
            .Must(Application.Common.FinanceMoney.IsWholeTenge).WithMessage("Сумма — целое число тенге.");
        RuleFor(x => x.Date)
            .Must(d => d.Year >= 2000).WithMessage("Укажите корректную дату.");
        RuleFor(x => x.Comment).MaximumLength(500);
    }
}
