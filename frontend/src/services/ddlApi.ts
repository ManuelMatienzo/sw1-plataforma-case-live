import { apiClient, getApiErrorMessage } from './api';
import { UMLDiagramAST } from '../types/uml';
import { PostgresDdlOptions, PostgresDdlResult } from '../types/ddl';

export const ddlApi = {
  /**
   * Genera el script DDL de PostgreSQL directamente desde el AST en memoria.
   * Funciona tanto en sesiones activas como en modo offline/demo.
   */
  async generarDesdeAst(ast: UMLDiagramAST, options?: PostgresDdlOptions): Promise<PostgresDdlResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: PostgresDdlResult }>(
        '/ddl/generar-directo',
        {
          ast,
          options,
        },
        {
          timeout: 20_000,
        }
      );
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible generar el script DDL PostgreSQL.');
      throw new Error(msg);
    }
  },

  /**
   * Genera el script DDL de PostgreSQL a partir del diagrama persistido de la sesión.
   */
  async generarDesdeSesion(sesionId: string, options?: PostgresDdlOptions): Promise<PostgresDdlResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: PostgresDdlResult }>(
        `/ddl/sesiones/${sesionId}/generar`,
        {
          options,
        },
        {
          timeout: 20_000,
        }
      );
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible generar el script DDL para la sesión.');
      throw new Error(msg);
    }
  },

  /**
   * Descarga el script schema.sql desde el servidor para la sesión especificada.
   */
  async descargarDesdeSesion(sesionId: string, options?: PostgresDdlOptions): Promise<void> {
    try {
      const response = await apiClient.get(`/ddl/sesiones/${sesionId}/descargar`, {
        params: options,
        responseType: 'blob',
      });

      // Extraer nombre de archivo si viene en header Content-Disposition
      let filename = 'schema.sql';
      const disposition = response.headers['content-disposition'];
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = new Blob([response.data], { type: 'application/sql;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Error al descargar el archivo DDL PostgreSQL.');
      throw new Error(msg);
    }
  },

  /**
   * Descarga directamente en el navegador una cadena de texto SQL como archivo .sql.
   */
  descargarTextoSql(sql: string, filename = 'schema.sql'): void {
    const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
