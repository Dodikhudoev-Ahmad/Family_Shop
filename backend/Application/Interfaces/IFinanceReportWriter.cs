using Application.DTOs;

namespace Application.Interfaces;

/// <summary>Turns a finance period into an Excel workbook (.xlsx).</summary>
public interface IFinanceReportWriter
{
    byte[] Write(FinanceExportDto export);
}
