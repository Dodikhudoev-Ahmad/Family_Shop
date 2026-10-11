namespace Application.DTOs;

public record CategoryDto(int Id, string Name, string Slug, int? ParentCategoryId, bool HasSizes, int SortOrder);

public record CategoryUpsertDto(string Name, string Slug, int? ParentCategoryId, bool HasSizes);
