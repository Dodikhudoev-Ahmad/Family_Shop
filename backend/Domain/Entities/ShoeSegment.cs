namespace Domain.Entities;

/// <summary>Who a pair of shoes is made for; it, not the size number, decides which size grid the product has
/// (37 exists in both the kids and the teen grid). Stored as an int: do not reorder.</summary>
public enum ShoeSegment
{
    Men = 0,
    Women = 1,
    Kids = 2,
    Teen = 3
}

/// <summary>The sex a kids' or teen shoe is made for. Adult segments have none.</summary>
public enum ChildGender
{
    Boy = 0,
    Girl = 1
}

public static class ShoeSegments
{
    /// <summary>The segment a shoe belongs to when none was chosen explicitly: what its <see cref="Gender"/> already says.
    /// Kids shoes default to <see cref="ShoeSegment.Kids"/>; the teen group is always an explicit choice.</summary>
    public static ShoeSegment DefaultFor(Gender gender) => gender switch
    {
        Gender.Male => ShoeSegment.Men,
        Gender.Female => ShoeSegment.Women,
        _ => ShoeSegment.Kids
    };

    /// <summary>The <see cref="Gender"/> a product of this segment must carry.</summary>
    public static Gender GenderOf(ShoeSegment segment) => segment switch
    {
        ShoeSegment.Men => Gender.Male,
        ShoeSegment.Women => Gender.Female,
        _ => Gender.Kids
    };

    /// <summary>Kids and teen shoes come for a boy or a girl; adult shoes have no such split.</summary>
    public static bool HasChildGender(ShoeSegment segment) => segment is ShoeSegment.Kids or ShoeSegment.Teen;
}
