"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  Calendar,
  Filter,
  Eye,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Report {
  id: string;
  user_id: string;
  filename: string;
  file_url: string;
  file_size: number;
  upload_date: string;
  report_type: "broker" | "custom";
  notes?: string;
  storage_path: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "broker" | "custom">("all");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // List all files in the user's folder
      const { data: files, error } = await supabase.storage
        .from("reports")
        .list(user.id, {
          limit: 100,
          offset: 0,
        });

      if (error) {
        console.error("Error listing files:", error);
        throw error;
      }

      console.log("Files from storage:", files);

      // Convert file list to report format
      const userReports: Report[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          // Skip if it's a folder
          if (file.id === null) continue;

          const filePath = `${user.id}/${file.name}`;

          // Get public URL for the file
          const {
            data: { publicUrl },
          } = supabase.storage.from("reports").getPublicUrl(filePath);

          const report: Report = {
            id: file.id || file.name,
            user_id: user.id,
            filename: file.metadata?.originalName || file.name,
            file_url: publicUrl,
            file_size: file.metadata?.size || 0,
            upload_date:
              file.created_at || file.updated_at || new Date().toISOString(),
            report_type: "broker",
            notes: file.metadata?.notes,
            storage_path: filePath,
          };

          userReports.push(report);
        }
      }

      setReports(
        userReports.sort(
          (a, b) =>
            new Date(b.upload_date).getTime() -
            new Date(a.upload_date).getTime()
        )
      );
    } catch (error) {
      console.error("Error fetching reports:", error);
      setError("Failed to fetch reports");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (
        file.type === "application/pdf" ||
        file.type.includes("spreadsheet") ||
        file.type.includes("excel") ||
        file.type.includes("csv")
      ) {
        setSelectedFile(file);
      } else {
        alert("Please select a PDF or Excel file");
      }
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Upload file to Supabase Storage
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("reports")
        .upload(fileName, selectedFile);

      if (error) throw error;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("reports").getPublicUrl(fileName);

      // Save report metadata (in a real app, you'd save to a reports table)
      const newReport: Report = {
        id: Date.now().toString(),
        user_id: user.id,
        filename: selectedFile.name,
        file_url: publicUrl,
        file_size: selectedFile.size,
        upload_date: new Date().toISOString(),
        report_type: "broker",
        notes: uploadNotes,
        storage_path: "",
      };

      setReports([newReport, ...reports]);
      setSelectedFile(null);
      setUploadNotes("");
      alert("File uploaded successfully!");
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (report: Report) => {
    if (!confirm("Are you sure you want to delete this report?")) return;

    try {
      const { error } = await supabase.storage
        .from("reports")
        .remove([report.storage_path]);

      if (error) throw error;

      // Refresh the reports list to reflect the deletion
      await fetchReports();

      // Clear any preview if the deleted report was being previewed
      if (previewReport?.id === report.id) {
        setPreviewReport(null);
      }
    } catch (error: any) {
      console.error("Error deleting report:", error);
      setError("Failed to delete report");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const filteredReports =
    filter === "all"
      ? reports
      : reports.filter((r) => r.report_type === filter);

  const handleDownload = async (report: Report) => {
    try {
      // Download the file from Supabase storage
      const { data, error } = await supabase.storage
        .from("reports")
        .download(report.storage_path);

      if (error) throw error;
      if (!data) throw new Error("No data received");

      // Create a blob and download it
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = report.filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading file:", error);
      setError("Failed to download file");
    }
  };

  const handlePreview = async (report: Report) => {
    setPreviewLoading(true);
    try {
      // For PDFs, we can use the public URL directly
      if (report.filename.toLowerCase().endsWith(".pdf")) {
        const { data, error } = await supabase.storage
          .from("reports")
          .createSignedUrl(report.storage_path, 3600); // URL valid for 1 hour

        if (error) throw error;

        setPreviewReport({
          ...report,
          file_url: data.signedUrl,
        });
      } else {
        // For CSV/Excel files, we might want to download and parse them
        // For now, let's just show a download option
        setPreviewReport(report);
      }
    } catch (error) {
      console.error("Error previewing file:", error);
      setError("Failed to preview file");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Reports</h1>
        <p className="text-gray-400 mt-2">
          Upload and manage your trading reports
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Upload Report</h2>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-300 mb-2">
              {selectedFile
                ? selectedFile.name
                : "Drop your report file here or click to browse"}
            </p>
            <p className="text-gray-500 text-sm mb-4">
              Supports PDF, Excel, and CSV files up to 10MB
            </p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={handleFileSelect}
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
            >
              Select File
            </label>
          </div>

          {selectedFile && (
            <>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Add any notes about this report..."
                  rows={3}
                />
              </div>

              <button
                onClick={handleFileUpload}
                disabled={uploading}
                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Uploading..." : "Upload Report"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-gray-400 text-sm">Filter:</span>
          <div className="flex gap-2">
            {[
              { value: "all", label: "All Reports" },
              { value: "broker", label: "Broker Reports" },
              { value: "custom", label: "Custom Reports" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value as any)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === option.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-gray-400 text-sm">
          {filteredReports.length} report
          {filteredReports.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            Loading reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No reports uploaded yet</p>
            <p className="text-gray-500 text-sm mt-2">
              Upload your first report to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="p-6 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-gray-700 rounded-lg">
                      <FileText className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">
                        {report.filename}
                      </h3>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-400">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {format(parseISO(report.upload_date), "MMM dd, yyyy")}
                        </span>
                        <span>{formatFileSize(report.file_size)}</span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            report.report_type === "broker"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-purple-500/10 text-purple-500"
                          }`}
                        >
                          {report.report_type === "broker"
                            ? "Broker Report"
                            : "Custom Report"}
                        </span>
                      </div>
                      {report.notes && (
                        <p className="text-gray-500 text-sm mt-2">
                          {report.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePreview(report)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                      title="Preview"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDownload(report)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(report)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-600 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {previewReport.filename}
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  {format(parseISO(previewReport.upload_date), "MMMM dd, yyyy")}
                </p>
              </div>
              <button
                onClick={() => setPreviewReport(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">Loading preview...</p>
                </div>
              ) : previewReport.filename.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={`${previewReport.file_url}#toolbar=0`}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: "600px" }}
                  title={previewReport.filename}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <FileText className="w-16 h-16 text-gray-600" />
                  <p className="text-gray-400 text-center">
                    Preview not available for this file type.
                  </p>
                  <button
                    onClick={() => handleDownload(previewReport)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download to View
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer with Notes */}
            {previewReport.notes && (
              <div className="p-6 border-t border-gray-700">
                <p className="text-gray-400 text-sm">
                  <span className="font-medium">Notes:</span>{" "}
                  {previewReport.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
