using System.Text.RegularExpressions;

namespace FamilyShop.Domain.ValueObjects;

public readonly partial record struct Email
{
    public string Value { get; }

    public Email(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !EmailRegex().IsMatch(value))
        {
            throw new ArgumentException("Invalid email address.", nameof(value));
        }

        Value = value.Trim().ToLowerInvariant();
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRegex();
}
