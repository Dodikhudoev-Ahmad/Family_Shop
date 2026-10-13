using Application.Common;
using Domain.Entities;

namespace Application.Services;

/// <summary>The segment and the boy/girl of a shoe that is going to be stored.</summary>
public readonly record struct ShoeAudience(ShoeSegment? Segment, ChildGender? ChildGender);

/// <summary>Who a product's shoes are for. Which size grid a shoe has follows from this (SizeGrids), so it is checked
/// before the sizes are, and it depends on the category and type of the product - hence the service, not the validator.</summary>
public static class ShoeAudienceRules
{
    public const string OnlyForShoes = "Возрастная группа и пол «мальчик/девочка» указываются только для обуви с размерами.";
    public const string SegmentMismatch = "Возрастная группа не соответствует полу товара.";
    public const string ChildGenderRequired = "Укажите, для кого обувь: мальчик или девочка.";
    public const string ChildGenderForbidden = "Для взрослой обуви пол «мальчик/девочка» не указывается.";

    /// <summary>A shoe without an explicit segment gets the one its <paramref name="gender"/> says (kids, never teen).
    /// Kids and teen shoes need boy or girl; adult shoes and non-shoes must not have one.</summary>
    public static Result<ShoeAudience> Resolve(
        Category category, string? productType, Gender gender, ShoeSegment? requested, ChildGender? childGender)
    {
        if (!SizeGrids.IsSizedShoe(category, productType))
        {
            return requested is null && childGender is null
                ? Result<ShoeAudience>.Success(default)
                : Result<ShoeAudience>.Failure(OnlyForShoes);
        }

        var segment = requested ?? ShoeSegments.DefaultFor(gender);
        if (ShoeSegments.GenderOf(segment) != gender)
        {
            return Result<ShoeAudience>.Failure(SegmentMismatch);
        }

        if (ShoeSegments.HasChildGender(segment))
        {
            return childGender is null
                ? Result<ShoeAudience>.Failure(ChildGenderRequired)
                : Result<ShoeAudience>.Success(new ShoeAudience(segment, childGender));
        }

        return childGender is null
            ? Result<ShoeAudience>.Success(new ShoeAudience(segment, null))
            : Result<ShoeAudience>.Failure(ChildGenderForbidden);
    }
}
