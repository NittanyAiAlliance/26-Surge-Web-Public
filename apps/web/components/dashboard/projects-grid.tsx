"use client"

import { EmptyState } from "@/components/data-display/empty-state"
import { ProjectCard } from "./project-card"
import type { Project } from "@radiant/db"

interface ProjectsGridProps {
  projects: Project[]
}

export function ProjectsGrid({ projects }: ProjectsGridProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="Your first website is 6 minutes away."
        description="Enter a business name and watch Radiant build something beautiful."
        action={{ label: "Generate your first site", href: "/dashboard/create" }}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          id={project.id}
          businessName={project.business_name}
          subdomain={project.subdomain}
          status={project.status}
          industry={project.industry}
          vercelDeploymentUrl={project.vercel_deployment_url}
          updatedAt={project.updated_at}
        />
      ))}
    </div>
  )
}
