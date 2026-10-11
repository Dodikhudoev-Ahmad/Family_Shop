namespace Domain.Entities;

/// <summary>Display order of the known categories, in steps of <see cref="Step"/> so that a category can be slotted in
/// between two others later. The same values are written by the AddCategorySortOrder migration and by the seeder.</summary>
public static class CategorySortOrder
{
    public const int Step = 10;

    public static readonly IReadOnlyDictionary<string, int> BySlug = new Dictionary<string, int>
    {
        ["women"] = 10,
        ["men"] = 20,
        ["kids"] = 30,
        ["bytovaya-tehnika"] = 40,
        ["dom-i-byt"] = 50,
        ["posuda"] = 60,
        ["sport"] = 70,
        ["aksessuary"] = 80,
    };
}
