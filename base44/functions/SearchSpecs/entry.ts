import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { query, project_id } = body;

    if (!query) return Response.json({ error: 'query required' }, { status: 400 });

    let specs = await base44.entities.Specification.list();
    if (project_id) {
      specs = specs.filter(s => s.project_id === project_id);
    }

    const specsByUrl = {};
    const fileUrls = [];
    for (const s of specs) {
      if (s.file_url) {
        fileUrls.push(s.file_url);
        specsByUrl[s.file_url] = s;
      }
    }

    if (fileUrls.length === 0) {
      return Response.json({ answer: 'No specification documents found to search through.', sources: [] });
    }

    const specList = specs.map(s => `- ${s.title} (Spec ${s.spec_number || 'N/A'}, v${s.version})`).join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a specification search assistant. The user has a repository of technical specification documents. Answer their question based on the attached specification files.

Available specifications:
${specList}

Instructions:
- Answer the question based on the content of the attached files.
- Reference which specification(s) the answer comes from by title.
- If the question asks about something not covered in the documents, say so clearly.
- Be concise but thorough. Use bullet points where appropriate.

Question: ${query}`,
      file_urls: fileUrls,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                spec_number: { type: 'string' }
              }
            }
          }
        }
      }
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}