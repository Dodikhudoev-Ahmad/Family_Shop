namespace FamilyShop.Application.DTOs;

public record CategoryDto(int Id, string Name, string Slug, int? ParentCategoryId);
