package com.example.document.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentDTO {
    private Long id;

    @NotBlank(message = "Title is required")
    @Size(max = 200, message = "Title must be at most 200 characters")
    private String title;

    @NotBlank(message = "Author ID is required")
    @Size(max = 120, message = "Author ID must be at most 120 characters")
    private String authorId;

    @NotNull(message = "Markdown content is required")
    @Size(max = 1000000, message = "Markdown is too long")
    private String markdown;

    private Instant createdAt;
    private Instant updatedAt;
}
