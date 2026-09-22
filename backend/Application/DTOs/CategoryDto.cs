namespace Application.DTOs;

public record CategoryDto(int Id, string Name, string Slug, int? ParentCategoryId, bool HasSizes);

public record CategoryUpsertDto(string Name, string Slug, int? ParentCategoryId, bool HasSizes);
